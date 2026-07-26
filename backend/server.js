// TrustVote backend — three production services in one small Node process:
//
//   POST /pin        Pinata proxy: pins JSON to IPFS with the JWT held
//                    SERVER-side, so the credential never ships in the
//                    browser bundle. Falls back to mock CIDs without a JWT.
//   GET  /ipfs/:cid  Gateway proxy with fallbacks (and mock-store reads).
//   POST /relay      GASLESS VOTING relayer: accepts a ballot (proof +
//                    public signals) and submits castVote paying the gas.
//                    Sound because castVote never depends on msg.sender —
//                    identity is the nullifier, eligibility is the proof.
//   GET  /elections  Event indexer: cached ElectionCreated list for
//                    instant election discovery without client log scans.
//
// Run: cp .env.example .env && npm install && npm start
import express from "express";
import cors from "cors";
import { ethers } from "ethers";

const {
  PORT = 8787,
  RPC_URL = "http://127.0.0.1:8545",
  PLATFORM_ADDRESS,
  RELAYER_PRIVATE_KEY,
  PINATA_JWT,
  DEPLOY_BLOCK = "0",
} = process.env;

const ABI = [
  "event ElectionCreated(uint256 indexed electionId, bytes32 merkleRoot, uint256 startTime, uint256 endTime, string metadataCid)",
  "function castVote(uint256 electionId, uint256 nullifier, uint256[4] ciphertext, uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[9] input)",
];

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = RELAYER_PRIVATE_KEY
  ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider)
  : null;
const readContract = PLATFORM_ADDRESS
  ? new ethers.Contract(PLATFORM_ADDRESS, ABI, provider)
  : null;

/* ------------------------------ rate limiting --------------------------- */
const hits = new Map(); // ip -> [timestamps]
function limited(ip, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

/* ------------------------------ IPFS: pin ------------------------------- */
const mockStore = new Map(); // mock CID -> content (dev fallback)

app.post("/pin", async (req, res) => {
  try {
    const { content, name = "trustvote.json" } = req.body || {};
    if (content === undefined) return res.status(400).json({ error: "content required" });

    if (!PINATA_JWT) {
      const { createHash } = await import("crypto");
      const cid =
        "QmMOCK" +
        createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 40);
      mockStore.set(cid, content);
      return res.json({ cid, mock: true });
    }
    const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({ pinataMetadata: { name }, pinataContent: content }),
    });
    if (!r.ok) throw new Error(`Pinata ${r.status}: ${await r.text()}`);
    const j = await r.json();
    res.json({ cid: j.IpfsHash });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/* ------------------------------ IPFS: fetch ----------------------------- */
const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

app.get("/ipfs/:cid", async (req, res) => {
  const { cid } = req.params;
  if (mockStore.has(cid)) return res.json(mockStore.get(cid));
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g + cid, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return res.json(await r.json());
    } catch {
      /* try next gateway */
    }
  }
  res.status(404).json({ error: "CID not resolvable" });
});

/* --------------------------- gasless relayer ---------------------------- */
app.post("/relay", async (req, res) => {
  try {
    if (!relayerWallet || !PLATFORM_ADDRESS)
      return res.status(503).json({ error: "Relayer not configured" });
    const ip = req.ip || "?";
    if (limited(ip)) return res.status(429).json({ error: "Rate limited" });

    const { electionId, nullifier, ciphertext, a, b, c, input } = req.body || {};
    // Shape validation only — the CONTRACT is the security boundary: it
    // checks the window, nullifier, stored parameters, and the Groth16 proof.
    if (
      !electionId || !nullifier ||
      !Array.isArray(ciphertext) || ciphertext.length !== 4 ||
      !Array.isArray(a) || a.length !== 2 ||
      !Array.isArray(b) || b.length !== 2 ||
      !Array.isArray(c) || c.length !== 2 ||
      !Array.isArray(input) || input.length !== 9
    )
      return res.status(400).json({ error: "Malformed ballot payload" });

    const contract = new ethers.Contract(PLATFORM_ADDRESS, ABI, relayerWallet);
    // Dry-run first so invalid ballots cost the relayer nothing.
    await contract.castVote.staticCall(
      BigInt(electionId), BigInt(nullifier),
      ciphertext.map(BigInt),
      a.map(BigInt),
      [b[0].map(BigInt), b[1].map(BigInt)],
      c.map(BigInt),
      input.map(BigInt)
    );
    const tx = await contract.castVote(
      BigInt(electionId), BigInt(nullifier),
      ciphertext.map(BigInt),
      a.map(BigInt),
      [b[0].map(BigInt), b[1].map(BigInt)],
      c.map(BigInt),
      input.map(BigInt)
    );
    res.json({ txHash: tx.hash });
  } catch (e) {
    res.status(400).json({ error: e.shortMessage || e.reason || e.message });
  }
});

/* ----------------------------- event indexer ---------------------------- */
let electionsCache = [];
async function reindex() {
  if (!readContract) return;
  try {
    const logs = await readContract.queryFilter(
      readContract.filters.ElectionCreated(),
      Number(DEPLOY_BLOCK)
    );
    electionsCache = logs.map((l) => ({
      id: l.args.electionId.toString(),
      metadataCid: l.args.metadataCid,
      startTime: l.args.startTime.toString(),
      endTime: l.args.endTime.toString(),
      block: l.blockNumber,
    }));
  } catch (e) {
    console.error("indexer:", e.message);
  }
}
setInterval(reindex, 15_000);
reindex();

app.get("/elections", (_req, res) => res.json(electionsCache));

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    relayer: !!relayerWallet,
    pinata: !!PINATA_JWT,
    indexed: electionsCache.length,
  })
);

app.listen(PORT, () =>
  console.log(
    `TrustVote backend on :${PORT} · relayer=${!!relayerWallet} · pinata=${!!PINATA_JWT}`
  )
);
