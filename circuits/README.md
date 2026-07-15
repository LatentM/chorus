# TrustVote — ZK Circuit

`VotingCircuit.circom` proves voter eligibility (fixed-depth-20 Poseidon
Merkle proof over voter commitments `Poseidon(BabyPbk(secretKey).Ax)`),
nullifier correctness (`Poseidon(secretKey, electionId)`), vote range
(`Num2Bits(4)` + `vote < nCandidates`), and **real in-circuit exponential
ElGamal** ciphertext well-formedness:

```
C1 = g·r               (EscalarMulFix over Base8)
C2 = h·r + g·vote      (EscalarMulAny over the election key h, BabyAdd)
```

with `h` validated on-curve (`BabyCheck`), `r ≠ 0` enforced, and `h` exposed
as public inputs so the contract can pin it to the on-chain election key.

**Public signals (9):**
`[root, electionId, nullifier, c1x, c1y, c2x, c2y, pubKeyX, pubKeyY]`
— matching `VotingPlatform.castVote`'s `uint[9]` exactly (snarkjs orders
outputs first, then public inputs).

## Prerequisites

```bash
# circom 2.1.5 compiler (Rust binary)
git clone https://github.com/iden3/circom.git && cd circom
git checkout v2.1.5 && cargo build --release && cargo install --path circom

npm install -g snarkjs
npm install circomlib   # in this directory, so the includes resolve
```

## Compile

```bash
circom VotingCircuit.circom --r1cs --wasm --sym -o build -l node_modules
```

Outputs: `build/VotingCircuit.r1cs`, `build/VotingCircuit_js/VotingCircuit.wasm`,
`build/VotingCircuit.sym`.

## Trusted setup (simulated ceremony — fine for a college project)

```bash
# Powers of Tau (phase 1) — pot16 covers this circuit comfortably
snarkjs powersoftau new bn128 16 pot16_0000.ptau -v
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau --name="First" -v
snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau -v

# Phase 2 (circuit-specific)
snarkjs groth16 setup build/VotingCircuit.r1cs pot16_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="Contributor" -v
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

## Export the real Solidity verifier (replaces the mock)

```bash
snarkjs zkey export solidityverifier circuit_final.zkey ../contracts/contracts/Groth16Verifier.sol
```

Then redeploy with `contracts/scripts/deploy.js`.

## Wire the frontend

Copy the proving artifacts where the web app can fetch them:

```bash
cp build/VotingCircuit_js/VotingCircuit.wasm ../frontend/public/circuits/
cp circuit_final.zkey ../frontend/public/circuits/
```

The voter page automatically switches from mock proofs to real Groth16 proofs
once both files exist (see `frontend/src/pages/VotePage.jsx`).

## Remaining TODOs before production use

- Compile the circuit and run the full pipeline above — the circuit has not
  yet been through `circom` in CI, so expect the usual round of compiler
  nits (include paths, signal names) before the ceremony.
- Run a real (not simulated) multi-party Powers of Tau ceremony.
- Independent constraint-level audit — in particular the `EscalarMulFix`
  zero-scalar edge (`vote = 0` must yield the identity `(0,1)` to match the
  JS-side encoding) should be confirmed with a witness test:
  `snarkjs wtns calculate` on a `vote: 0` input, then compare the `c2`
  signals against `frontend/src/lib/crypto.js encryptVote`.
