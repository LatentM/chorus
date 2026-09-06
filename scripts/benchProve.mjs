// Proof-generation benchmark for the paper's evaluation section.
//
//   npm run bench            (10 runs)      or      node benchProve.mjs 20
//
// Builds a synthetic but VALID circuit input — one registered voter in a
// depth-20 tree, a random election key, a random ballot — then runs
// snarkjs groth16.fullProve N times and prints min / median / max.
//
// Node timings are a sanity check. The browser number, printed in the
// Voter tab after every vote ("Proof generated ✓ (x.xx s)"), is what
// Table 2 of the paper should report.
import { groth16 } from "snarkjs";
import { buildPoseidon, buildBabyjub } from "circomlibjs";
import { statSync, existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const DEPTH = 20, N_CANDIDATES = 10;
const WASM = "../frontend/public/circuits/VotingCircuit.wasm";
const ZKEY = "../frontend/public/circuits/circuit_final.zkey";
const runs = Number(process.argv[2] || 10);

for (const f of [WASM, ZKEY]) if (!existsSync(f)) {
  console.error(`missing ${f} — run the ceremony in circuits/ first`); process.exit(1);
}

const poseidon = await buildPoseidon();
const babyJub = await buildBabyjub();
const F = babyJub.F;
const H = (...xs) => F.toObject(poseidon(xs));
const rand = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let x = 0n; for (const v of b) x = (x << 8n) | BigInt(v);
  return x % babyJub.subOrder;
};

// voter
const secretKey = rand();
const pk = babyJub.mulPointEscalar(babyJub.Base8, secretKey);
const leaf = H(F.toObject(pk[0]));
// tree: this voter at index 0, everything else zero-padded
const zeros = [0n];
for (let i = 0; i < DEPTH; i++) zeros.push(H(zeros[i], zeros[i]));
const siblings = zeros.slice(0, DEPTH).map(String);
const pathIndices = Array(DEPTH).fill(0);
// election key
const electionSk = rand();
const epk = babyJub.mulPointEscalar(babyJub.Base8, electionSk);
const input = {
  secretKey: secretKey.toString(),
  siblings, pathIndices,
  vote: Math.floor(Math.random() * N_CANDIDATES),
  encRandomness: (rand() || 1n).toString(),
  electionIdInput: "1",
  pubKeyX: F.toObject(epk[0]).toString(),
  pubKeyY: F.toObject(epk[1]).toString(),
};

console.log(`zkey ${(statSync(ZKEY).size / 1e6).toFixed(1)} MB · wasm ${(statSync(WASM).size / 1e6).toFixed(1)} MB · runs ${runs}`);
const times = [];
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  const { publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
  const ms = performance.now() - t0; times.push(ms);
  if (i === 0) console.log(`root ${publicSignals[0].slice(0, 12)}… · nullifier ${publicSignals[2].slice(0, 12)}…`);
  console.log(`run ${i + 1}: ${(ms / 1000).toFixed(2)} s`);
}
times.sort((a, b) => a - b);
const med = times[Math.floor(times.length / 2)];
console.log(`\nmin ${(times[0] / 1000).toFixed(2)} s · median ${(med / 1000).toFixed(2)} s · max ${(times.at(-1) / 1000).toFixed(2)} s`);
process.exit(0);
