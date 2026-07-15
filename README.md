# TrustVote

A zero-knowledge, blockchain-based voting platform with end-to-end
verifiability on **Polygon Amoy**.

- **Ballot secrecy** — exponential ElGamal on BabyJubJub; nobody (including the
  operator) can see an individual vote.
- **One-person-one-vote** — Poseidon nullifiers `Poseidon(secretKey, electionId)`
  enforced on-chain.
- **Eligibility without identity** — Poseidon Merkle tree membership proven in
  zero knowledge (Groth16 / Circom).
- **Public auditability** — Chaum-Pedersen DLEQ proofs let anyone verify every
  decryption and re-tally the election.

```
trustvote/
├── contracts/   Hardhat · VotingPlatform.sol · Groth16Verifier.sol (mock) · tests · deploy
├── circuits/    Circom 2.1.5 · VotingCircuit.circom (depth 20, 10 candidates)
├── scripts/     Node ESM · deriveCommitments.js · generateMerkleTree.js · generateKeys.js · tally.js · pinata.js
└── frontend/    React 18 + Vite 5 · wagmi 2 · RainbowKit 2 · snarkjs · Tailwind
```

## Quick start

### 0. Prerequisites

- Node.js ≥ 18, npm
- MetaMask (or any RainbowKit-supported wallet) with the **Polygon Amoy**
  network added (chain id 80002, RPC `https://rpc-amoy.polygon.technology`)
- **Test MATIC faucet:** https://faucet.polygon.technology (select Amoy) —
  the deployer/admin wallet and every voter wallet need a little POL/MATIC for gas.

### 1. Contracts

```bash
cd contracts
npm install
npx hardhat compile          # ✅ acceptance: compiles
npx hardhat test             # election lifecycle unit tests
cp .env.example .env         # add PRIVATE_KEY (admin wallet)
npm run deploy:amoy          # deploys Groth16Verifier (mock) then VotingPlatform
```

Copy the printed `VotingPlatform` address.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# set VITE_PLATFORM_ADDRESS=<deployed address>
# set VITE_WALLETCONNECT_PROJECT_ID (free at https://cloud.walletconnect.com)
# optionally set VITE_PINATA_JWT (see Pinata setup below)
npm run dev                  # ✅ acceptance: http://localhost:3000
```

### 3. Run a full mock election (no ZK ceremony needed)

The deployed verifier is a **mock that accepts every proof**, so the entire
Admin → Voter → Verifier lifecycle works before the circuit is compiled:

1. **Registration phase.** The admin announces the upcoming *Election ID*.
   Each voter opens **Voter tab → Register**, enters the ID, signs
   `TrustVote Election: <id>`, and sends the derived **commitment**
   (`Poseidon(BabyPbk(secretKey).Ax)`) to the admin. For a one-machine demo,
   `cd scripts && node deriveCommitments.js 1` derives commitments for the
   8 standard Hardhat dev accounts into `commitments.csv`.
2. **Admin tab** (connect the deployer wallet): fill in the wizard, upload
   the collected `commitments.csv`, set a vault password, click
   *Build tree · upload · createElection*. The encrypted ElGamal private key
   downloads automatically — keep it.
3. **Voter tab → Cast a ballot** (connect a registered wallet): load the
   election, optionally *Check my registration*, pick a candidate, *Cast
   anonymous vote*. You'll sign `TrustVote Election: <id>` (secret
   derivation), then the app rebuilds your commitment, extracts the Merkle
   proof, computes the nullifier, ElGamal-encrypts the ballot, generates a
   (mock or real) proof in a Web Worker, and submits `castVote`. Save the
   nullifier from the receipt. *Verify my vote* re-derives the nullifier and
   checks it on-chain.
4. **Admin tab → Tally**: after `endTime`, upload the key vault, enter the
   password, *Decrypt · prove · publish*. This fetches all `VoteCast` events,
   decrypts each ballot, brute-forces the small discrete log, generates a
   Chaum-Pedersen proof per decryption, uploads `results.json` to IPFS, and
   calls `setResultCID`.
5. **Verifier tab** (any wallet or none): enter the election id → the page
   pulls events from the public RPC, results from IPFS, verifies every
   Chaum-Pedersen proof, re-tallies, and shows the **VERIFIED** badge.

CLI equivalents live in `/scripts`:

```bash
cd scripts && npm install
node deriveCommitments.js 1                # registration (demo: Hardhat keys)
node generateMerkleTree.js commitments.csv # depth-20 tree + IPFS upload
node generateKeys.js                       # ElGamal keypair
PLATFORM_ADDRESS=0x... node tally.js 1     # decrypt + prove + publish
```

> **Mock IPFS:** with no Pinata key configured, uploads get deterministic
> `QmMOCK…` CIDs stored locally (browser `localStorage` / `scripts/.mock-ipfs/`),
> so the full flow works offline on one machine.

### 4. Going real: compile the circuit & replace the mock verifier

See `circuits/README.md` for the full ceremony. Summary:

```bash
circom circuits/VotingCircuit.circom --r1cs --wasm --sym -o circuits/build -l circuits/node_modules
snarkjs powersoftau new bn128 16 pot16_0000.ptau
snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau --name="First"
snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau
snarkjs groth16 setup circuits/build/VotingCircuit.r1cs pot16_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="Contributor"
snarkjs zkey export solidityverifier circuit_final.zkey contracts/contracts/Groth16Verifier.sol
cp circuits/build/VotingCircuit_js/VotingCircuit.wasm frontend/public/circuits/
cp circuit_final.zkey frontend/public/circuits/
```

Redeploy, and the voter page automatically switches from mock to real Groth16
proofs once `frontend/public/circuits/` contains both artifacts (it then also
submits the prover's own public signals verbatim).

The circuit is complete — real in-circuit ElGamal (`C1 = g·r`,
`C2 = h·r + g·vote` via EscalarMulFix/EscalarMulAny/BabyAdd), 9 public
signals `[root, electionId, nullifier, c1x, c1y, c2x, c2y, pubKeyX, pubKeyY]`
pinned by the contract, and a commitment-based voter tree matching the
circuit's leaf exactly — but it has **not yet been compiled** (this repo was
authored offline), so budget time for compiler nits before the ceremony.

## Pinata (IPFS) setup

1. Create a free account at https://app.pinata.cloud
2. API Keys → New Key → enable `pinJSONToIPFS` → copy the **JWT**.
3. Put it in `frontend/.env` as `VITE_PINATA_JWT=` and export
   `PINATA_JWT=` for the CLI scripts.

Uploaded artifacts: `merkleTree.json`, election metadata, and
`results.json` (tally + decryption proofs).

## Cryptographic primitives (spec §5)

| Primitive | Usage |
|---|---|
| Poseidon | Merkle leaves & nodes, nullifier derivation (SNARK-friendly) |
| BabyJubJub | ElGamal encryption, key derivation (native to BN254) |
| Groth16 | ZK proof system (~256-byte proofs, ~200k gas verification) |
| ElGamal | Ballot confidentiality (additively homomorphic) |
| Merkle tree | Voter eligibility without revealing identity |
| Nullifier | Double-vote prevention, unlinkable to the address |
| Chaum-Pedersen DLEQ | Publicly verifiable decryption |

## 10-week implementation plan (spec §10)

**Phase 1 — Foundation (Weeks 1–2).** Monorepo setup (`/contracts` Hardhat,
`/frontend` Vite+React). Deploy mock Groth16Verifier and VotingPlatform with
Hardhat unit tests for the election lifecycle. Frontend skeleton with
RainbowKit/wagmi/Tailwind, wallet connection, Amoy network switch, static
election list. *Deliverable:* page that connects MetaMask and calls a mock
castVote.

**Phase 2 — ZK circuit & on-chain verification (Weeks 3–4).** Write
VotingCircuit.circom (Merkle proof, nullifier, ElGamal, 1-out-of-N check);
test with circom_tester/snarkjs; simulated trusted setup; export the Solidity
verifier and integrate it; Hardhat tests submitting real proofs and rejecting
tampered inputs. *Deliverable:* circuit tested, real verifier deployed.

**Phase 3 — Voting frontend integration (Weeks 5–6).** Sample 50-address
voter list → Poseidon Merkle tree → Pinata; browser proof computation for the
connected address; Web Worker snarkjs proving with progress UX; castVote
wiring and error handling; Verify-my-vote page. *Deliverable:* complete voter
journey on Amoy.

**Phase 4 — Admin dashboard & decryption (Weeks 7–8).** Create-election
wizard (CSV upload, auto tree build, IPFS upload, client-side key generation);
Node tally script (fetch events, decrypt, Chaum-Pedersen proofs); results
publishing and the public verifier page. *Deliverable:* full lifecycle
create → vote → tally → verify demonstrable.

**Phase 5 — Polish, testing, documentation (Weeks 9–10).** Loading states,
error messages, responsive design; security/edge-case tests (double vote,
ineligible voter, wrong election id/root, 10k-voter proof benchmark); project
report, demo video, README; deploy frontend to Vercel/Netlify and verify the
contract on Polygonscan. *Deliverable:* submission-ready project.

## Security notes / known TODOs

- `Groth16Verifier.sol` is a **mock** (accepts all proofs) until the ceremony
  runs — clearly unsafe for anything but development. It is inherently a
  build artifact of `snarkjs zkey export solidityverifier`; there is no way
  to write it by hand.
- The circuit, contracts, and clients have **not been compiled or executed
  end-to-end** — run `npm install && npx hardhat test` in `/contracts`, the
  circom pipeline in `/circuits`, and a witness sanity test (especially the
  `vote = 0` identity-point edge, see `circuits/README.md`) before trusting
  the stack.
- **Design deviation from spec §6.2 (documented):** the verifier interface is
  `uint[9]`, not `uint[7]` — the two extra signals bind the ElGamal election
  key inside the proof and are checked against on-chain storage
  (`Pubkey mismatch`). Without this, a prover could encrypt under an
  arbitrary key and submit a permanently undecryptable (spoiled) ballot.
- **Registration phase (resolves the spec §4.2 vs §7 leaf mismatch):** the
  Merkle leaf is the voter commitment `Poseidon(BabyPbk(sk).Ax)` exactly as
  the circuit derives it. Voters register commitments before election
  creation (Voter tab → Register / `scripts/deriveCommitments.js`); Ethereum
  addresses never enter the tree, which also removes the address↔ballot
  linkability the address-leaf design would have had.
- Use a real multi-party Powers of Tau ceremony before any production use.
