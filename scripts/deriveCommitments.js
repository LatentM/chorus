// Usage: node deriveCommitments.js <electionId> [keys.csv] [out=commitments.csv]
//
// REGISTRATION-PHASE helper. For each Ethereum private key in keys.csv
// (one 0x-key per line — defaults to the 8 well-known Hardhat dev keys),
// this script performs exactly what a voter's wallet does in the frontend:
//
//   1. sign the message  "TrustVote Election: [electionId]"   (personal_sign)
//   2. secretKey  = keccak256(signature) mod BabyJubJub subgroup order
//   3. pubKey     = Base8 * secretKey        (BabyPbk)
//   4. commitment = Poseidon(pubKey.x)       (the Merkle leaf)
//
// It writes commitments.csv (one decimal commitment per line) which
// generateMerkleTree.js consumes. In production, voters derive & submit
// their own commitment via the frontend's "Register" tab — the admin never
// sees any secret key.
import fs from "fs";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { buildPoseidon, buildBabyjub } from "circomlibjs";

const electionId = process.argv[2];
if (!electionId) {
  console.error("Usage: node deriveCommitments.js <electionId> [keys.csv] [out]");
  process.exit(1);
}
const keysPath = process.argv[3] || null;
const outPath = process.argv[4] || "commitments.csv";

// Hardhat's default dev account private keys (accounts 0-7) — DEMO ONLY.
const HARDHAT_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
];

async function main() {
  const keys = keysPath
    ? fs
        .readFileSync(keysPath, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith("0x"))
    : HARDHAT_KEYS;

  const poseidon = await buildPoseidon();
  const babyJub = await buildBabyjub();
  const F = poseidon.F;

  const message = `TrustVote Election: ${electionId}`;
  console.log(`Registration message: "${message}"`);

  const rows = [];
  for (const pk of keys) {
    const wallet = new Wallet(pk);
    const signature = await wallet.signMessage(message); // personal_sign
    const secretKey = BigInt(keccak256(toUtf8Bytes(signature))) % babyJub.subOrder;
    const pub = babyJub.mulPointEscalar(babyJub.Base8, secretKey);
    const pubAx = babyJub.F.toObject(pub[0]);
    const commitment = F.toObject(poseidon([pubAx]));
    rows.push(commitment.toString());
    console.log(`${wallet.address} -> commitment ${commitment.toString().slice(0, 18)}…`);
  }

  fs.writeFileSync(outPath, rows.join("\n") + "\n");
  console.log(`Wrote ${rows.length} commitments to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
