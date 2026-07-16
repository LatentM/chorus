// Usage: node tally.js <electionId> [keysFile=electionKeys.json] [nCandidates=10]
//
// 1. Connects to the target chain via ethers and fetches all VoteCast events
//    for the election.
// 2. For each ciphertext (C1, C2):
//      sharedSecret = C1 * sk
//      M            = C2 - sharedSecret          (point subtraction)
//      vote         = dlog_g(M)                  (precomputed table g*i)
// 3. Tallies votes per candidate.
// 4. Generates a Chaum-Pedersen DLEQ proof per decryption:
//      w random; R1 = g*w; R2 = C1*w
//      c = Hash(R1, R2, pk, C1, sharedSecret, electionId)   (Fiat–Shamir)
//      s = w + sk*c (mod subgroup order)
//    Verification: g*s == R1 + pk*c   and   C1*s == R2 + sharedSecret*c
// 5. Saves results.json and uploads it to Pinata; optionally calls
//    setResultCID on-chain when PRIVATE_KEY is set.
import fs from "fs";
import crypto from "crypto";
import { ethers } from "ethers";
import { buildBabyjub } from "circomlibjs";
import { uploadJSON } from "./pinata.js";

const RPC_URL =
  process.env.RPC_URL ||
  process.env.SEPOLIA_RPC_URL ||
  process.env.AMOY_RPC_URL ||
  "https://rpc-amoy.polygon.technology";
const PLATFORM_ADDRESS = process.env.PLATFORM_ADDRESS || "";
const DEPLOY_BLOCK = Number(process.env.DEPLOY_BLOCK || 0);

const electionId = BigInt(process.argv[2] ?? "1");
const keysFile = process.argv[3] || "electionKeys.json";
const nCandidates = Number(process.argv[4] || 10);

const ABI = [
  "event VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256[4] ciphertext)",
  "function setResultCID(uint256 electionId, string cid) external",
];

async function main() {
  if (!PLATFORM_ADDRESS)
    throw new Error("Set PLATFORM_ADDRESS env var to the VotingPlatform address");

  const babyJub = await buildBabyjub();
  const F = babyJub.F;
  const G = babyJub.Base8;
  const order = babyJub.subOrder;

  const { sk: skStr } = JSON.parse(fs.readFileSync(keysFile, "utf8"));
  const sk = BigInt(skStr);
  const pk = babyJub.mulPointEscalar(G, sk);

  // ---- 1. Fetch events ----
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const platform = new ethers.Contract(PLATFORM_ADDRESS, ABI, provider);
  const filter = platform.filters.VoteCast(electionId);
  const events = await platform.queryFilter(filter, DEPLOY_BLOCK, "latest");
  console.log(`Fetched ${events.length} VoteCast events for election ${electionId}`);

  // ---- 2. Precompute discrete-log table { pack(g*i) : i } ----
  // Includes the identity point (0,1) for vote = 0.
  const dlogTable = new Map();
  let acc = [F.e(0n), F.e(1n)]; // identity
  for (let i = 0; i < nCandidates; i++) {
    dlogTable.set(pointKey(F, acc), i);
    acc = babyJub.addPoint(acc, G);
  }

  const negate = (P) => [F.neg(P[0]), P[1]];
  const toPoint = (x, y) => [F.e(BigInt(x)), F.e(BigInt(y))];
  const coords = (P) => [F.toObject(P[0]).toString(), F.toObject(P[1]).toString()];

  // ---- 3. Decrypt, prove, tally ----
  const counts = new Array(nCandidates).fill(0);
  const decryptions = [];

  for (const ev of events) {
    const nullifier = ev.args.nullifier.toString();
    const [c1x, c1y, c2x, c2y] = ev.args.ciphertext.map((v) => BigInt(v));

    let plaintext = null;
    let sharedSecret, C1, C2;
    try {
      C1 = toPoint(c1x, c1y);
      C2 = toPoint(c2x, c2y);
      sharedSecret = babyJub.mulPointEscalar(C1, sk);
      const M = babyJub.addPoint(C2, negate(sharedSecret)); // C2 - shared
      const hit = dlogTable.get(pointKey(F, M));
      plaintext = hit === undefined ? null : hit;
    } catch {
      // Mock-mode ciphertexts (placeholder circuit) may not be curve points.
      plaintext = null;
    }

    if (plaintext === null) {
      console.warn(`  ! nullifier ${nullifier.slice(0, 12)}… : undecodable ciphertext (mock proof?) — skipped`);
      decryptions.push({
        nullifier,
        ciphertext: { c1x: c1x.toString(), c1y: c1y.toString(), c2x: c2x.toString(), c2y: c2y.toString() },
        plaintext: null,
        proof: null,
      });
      continue;
    }

    counts[plaintext]++;

    // ---- Chaum-Pedersen DLEQ proof ----
    const w = BigInt("0x" + crypto.randomBytes(32).toString("hex")) % order;
    const R1 = babyJub.mulPointEscalar(G, w);
    const R2 = babyJub.mulPointEscalar(C1, w);
    const c = challenge([
      ...coords(R1), ...coords(R2), ...coords(pk), ...coords(C1),
      ...coords(sharedSecret), electionId.toString(),
    ]) % order;
    const s = (w + sk * c) % order;

    decryptions.push({
      nullifier,
      ciphertext: { c1x: c1x.toString(), c1y: c1y.toString(), c2x: c2x.toString(), c2y: c2y.toString() },
      plaintext,
      sharedSecret: { x: coords(sharedSecret)[0], y: coords(sharedSecret)[1] },
      proof: {
        R1: { x: coords(R1)[0], y: coords(R1)[1] },
        R2: { x: coords(R2)[0], y: coords(R2)[1] },
        s: s.toString(),
      },
    });
  }

  // ---- 4. Results JSON ----
  const results = {
    electionId: Number(electionId),
    publicKey: { x: coords(pk)[0], y: coords(pk)[1] },
    results: counts.map((votes, i) => ({
      candidate: `Candidate ${i}`,
      index: i,
      votes,
    })),
    decryptions,
  };

  fs.writeFileSync("results.json", JSON.stringify(results, null, 2));
  console.log("Tally:", counts);
  console.log("Wrote results.json");

  // ---- 5. Upload to IPFS (Pinata or mock) ----
  const cid = await uploadJSON(results, `trustvote-results-${electionId}.json`);
  console.log(`Results CID: ${cid}`);

  if (process.env.PRIVATE_KEY) {
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const tx = await platform.connect(wallet).setResultCID(electionId, cid);
    await tx.wait();
    console.log(`setResultCID(${electionId}, ${cid}) confirmed: ${tx.hash}`);
  } else {
    console.log("PRIVATE_KEY not set — call setResultCID manually with this CID.");
  }
}

function pointKey(F, P) {
  return `${F.toObject(P[0])},${F.toObject(P[1])}`;
}

/** Fiat–Shamir challenge = keccak256 over the decimal-joined inputs. */
function challenge(parts) {
  const h = ethers.keccak256(ethers.toUtf8Bytes(parts.join("|")));
  return BigInt(h);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
