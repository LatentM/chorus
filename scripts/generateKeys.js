// Usage: node generateKeys.js [out=electionKeys.json]
//
// Generates an ElGamal key pair on BabyJubJub:
//   sk = random scalar mod subgroup order (crypto-secure randomness)
//   pk = Base8 * sk
// Prints sk, pkX, pkY and saves electionKeys.json.
//
// SECURITY NOTE: keep electionKeys.json OFFLINE. Anyone with sk can decrypt
// individual ballots. For the demo flow this file is read later by tally.js.
import fs from "fs";
import crypto from "crypto";
import { buildBabyjub } from "circomlibjs";

const outPath = process.argv[2] || "electionKeys.json";

async function main() {
  const babyJub = await buildBabyjub();
  const F = babyJub.F;

  // Random 32 bytes reduced mod the BabyJubJub subgroup order
  const rand = BigInt("0x" + crypto.randomBytes(32).toString("hex"));
  const sk = rand % babyJub.subOrder; // subgroup (prime) order of Base8

  const pk = babyJub.mulPointEscalar(babyJub.Base8, sk);
  const pkX = F.toObject(pk[0]).toString();
  const pkY = F.toObject(pk[1]).toString();

  console.log("ElGamal key pair (BabyJubJub):");
  console.log("  sk  =", sk.toString());
  console.log("  pkX =", pkX);
  console.log("  pkY =", pkY);

  fs.writeFileSync(
    outPath,
    JSON.stringify({ sk: sk.toString(), pkX, pkY }, null, 2)
  );
  console.log(`Saved ${outPath} — keep this file secret & offline!`);
  console.log("Use pkX/pkY in createElection(); sk is needed only for tally.js.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
