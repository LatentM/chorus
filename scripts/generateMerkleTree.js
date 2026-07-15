// Usage: node generateMerkleTree.js [commitments.csv] [out=merkleTree.json]
//
// Reads a CSV of voter COMMITMENTS (one decimal/hex value per line — see
// deriveCommitments.js and the frontend "Register" tab), and builds the
// FIXED-DEPTH-20 Poseidon Merkle tree the circuit expects:
//
//   leaf   = commitment = Poseidon(BabyPbk(secretKey).Ax)   (spec Section 7)
//   parent = Poseidon(left, right)
//   padding: level i pads missing right-siblings with zeros[i], where
//            zeros[0] = 0 and zeros[i+1] = Poseidon(zeros[i], zeros[i])
//
// This layout matches frontend/src/lib/crypto.js buildCommitmentTree and the
// circuit's MultiMerkleProof(20) exactly, so real Groth16 proofs verify
// against the root stored on-chain.
//
// Writes merkleTree.json and uploads it to IPFS via Pinata (mock CID if no
// PINATA_JWT is set).
import fs from "fs";
import { buildPoseidon } from "circomlibjs";
import { uploadJSON } from "./pinata.js";

const DEPTH = 20;
const csvPath = process.argv[2] || "commitments.csv";
const outPath = process.argv[3] || "merkleTree.json";

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const H2 = (l, r) => F.toObject(poseidon([l, r]));

  const commitments = fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => BigInt(l));

  if (commitments.length === 0)
    throw new Error(`No commitments found in ${csvPath} — run deriveCommitments.js first`);
  if (commitments.length > 2 ** DEPTH)
    throw new Error(`More than 2^${DEPTH} commitments`);
  console.log(`Read ${commitments.length} voter commitments from ${csvPath}`);

  // Zero-hash cascade for fixed-depth padding
  const zeros = [0n];
  for (let i = 0; i < DEPTH; i++) zeros.push(H2(zeros[i], zeros[i]));

  // Build all DEPTH levels; pad missing right-siblings with zeros[level]
  const levels = [commitments.slice()];
  let current = commitments.slice();
  for (let level = 0; level < DEPTH; level++) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : zeros[level];
      next.push(H2(left, right));
    }
    levels.push(next);
    current = next;
  }
  const root = current[0];

  const tree = {
    depth: DEPTH,
    root: root.toString(),
    leaves: commitments.map(String),
    zeros: zeros.map(String),
    // materialised (non-zero-region) internal nodes so clients can extract
    // proofs without rehashing
    levels: levels.map((lvl) => lvl.map(String)),
  };

  fs.writeFileSync(outPath, JSON.stringify(tree, null, 2));
  console.log(`Merkle root: ${root.toString()}`);
  console.log(`Fixed depth: ${DEPTH}  →  wrote ${outPath}`);

  const cid = await uploadJSON(tree, "merkleTree.json");
  console.log(`IPFS CID (store this in the election metadata): ${cid}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
