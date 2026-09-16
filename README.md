# Chorus

Anyone can check the count. No one can check your ballot.

Chorus runs elections where the result is publicly recomputable and the
individual ballot stays private. Not by policy — by construction. Your browser
encrypts the vote and proves you're on the electoral roll without revealing
which voter you are. A smart contract verifies that proof and refuses a second
ballot from the same person. After the polls close, the tally is published with
proofs that let a stranger recount it from scratch.

It works. On a four-year-old laptop a voter's browser builds a Groth16 proof in
**2.49 seconds**, and verifying it on-chain costs **318,519 gas**.

> **Not ready for a binding election**, and that isn't false modesty. The
> trusted setup was run by one person, who could therefore forge proofs. There
> is no defence against someone standing over your shoulder while you vote.
> Nobody outside the authors has reviewed the code. Details in
> [What's wrong with it](#whats-wrong-with-it).

---

## Try it

Four terminals. Node 20 (there's an `.nvmrc`).

```bash
npm run install:all

cd contracts && npx hardhat node                          # 1 — local chain
npx hardhat run scripts/deploy.js --network localhost     # 2 — deploy
cd backend  && npm start                                  # 3 — relayer (optional)
cd frontend && npm run dev                                # 4 — app on :3000
```

Put the deployed address in `frontend/.env` as `VITE_PLATFORM_ADDRESS` and
restart the dev server — Vite only reads `.env` at boot. Import one of the
private keys Hardhat printed into MetaMask or Rabby, on chain 31337.

Then: **Admin** to create an election, **Voter** to register and vote,
**Verifier** to recount it yourself.

Skip terminal 3 and votes come from your own wallet instead of the relayer.
Everything still works; you just pay gas.

---

## How it works

**Registering** doesn't put your address anywhere. You sign a message, your
browser derives a BabyJubJub keypair from that signature, and the administrator
receives `Poseidon(pubkey.x)` — a commitment that says nothing about who you
are. Those commitments become the leaves of a Merkle tree, and only its root
goes on-chain.

**Voting** encrypts your choice under the election's ElGamal key, then builds a
zero-knowledge proof of four things at once: your commitment is in the tree,
the nullifier is correctly derived from your secret, the candidate is in range,
and the ciphertext really encrypts that candidate under *this* election's key.
The contract checks the proof and whether the nullifier has been seen before.

The nullifier is the trick. It's `Poseidon(secret, electionId)` — deterministic,
so voting twice produces the same value and the second is rejected; one-way, so
it reveals nothing about you.

**Tallying** happens after the window closes; the contract won't accept a result
before then. Each decryption ships with a Chaum–Pedersen proof that it was done
with the real key. **Auditing** reads ciphertexts from chain events, fetches the
result from IPFS, re-checks every proof, and recounts.

The contract never sees a vote. It stores a root, a key, a time window, and a
set of used nullifiers — and emits ciphertexts as events rather than storing
them, which is ~77k gas cheaper per ballot.

### The thing we got wrong first

Our spec had seven public signals and left the ElGamal key out. That was a bug
with teeth: a voter could encrypt under a key of *their own*, produce a
perfectly valid proof, and submit a ballot that no one could ever decrypt.
Anonymous, so unattributable. Unremovable, so the tally is stuck.

The fix was to bind the key inside the proof as signals 8 and 9 and check them
against on-chain storage. It's the kind of gap that survives a specification
and only shows up when you build the thing.

---

## What's wrong with it

| | |
|---|---|
| **Trusted setup** | One participant. They could forge proofs. Production needs a multi-party ceremony. |
| **Coercion** | No defence. Someone can watch you vote. Re-voting would help, but the obvious version is unsound — see below. |
| **Anonymity set** | Privacy scales with turnout. A five-voter election hides very little, whatever the maths says. |
| **Trustees** | Shares are reconstructed in one browser rather than used for distributed decryption. |
| **Audit** | None. |

Two extensions were designed and deliberately not built.

**Re-voting** with last-ballot-counts is broken here. A Groth16 proof isn't
bound to when it was submitted, so anyone who captured your first ballot can
replay it after you re-vote — silently reinstating the coerced choice. Doing it
properly needs a freshness counter in the circuit, which means a new ceremony.

**Homomorphic aggregation** would mean decrypting only totals, never individual
ballots — real confidentiality against trustees rather than just unlinkability.
Exponential ElGamal was chosen so the ciphertexts are already additively
homomorphic when this lands. It needs a new circuit too.

One known bug: `setResultCID` can be called more than once, so a published
result can be replaced. Every call emits an event, so it's detectable in the
log — but it isn't prevented.

---

## Measured

Local chain, real verifier, HP Pavilion 14-ce3xxx (i5-1035G1, 8 GB, Chrome 153).

```
circuit                22,007 constraints
proving key            10.5 MiB  (+ 2.0 MiB wasm — one-time download)
proof, in browser      2.49 s    (median of 5, range 2.48–2.84)
castVote               318,519 gas
  same, mock verifier  71,716 gas   ← the pairing check costs ~247k
createElection         189,030 gas
setResultCID           77,297 gas
deploy                 1,729,377 gas total
```

Reproduce these yourself with [FILL-TABLE-2.md](FILL-TABLE-2.md).

---

## Layout

```
circuits/     VotingCircuit.circom — depth-20 Merkle + nullifier + ElGamal
contracts/    VotingPlatform.sol, Groth16Verifier.sol, 13 tests
frontend/     React + Vite. Proving runs in a Web Worker.
backend/      Optional: relayer, IPFS proxy, event indexer
scripts/      Commitments, tree, keys, tally, benchmark
```

- [VIVA-PREP.md](VIVA-PREP.md) — `VotingPlatform.sol` line by line
- [DEPLOYMENT.md](DEPLOYMENT.md) — testnet and mainnet, with real gas costs
- The paper — design rationale and threat model in full

---

## AI assistance

Claude was used substantially here: writing and refactoring implementation
code, drafting documentation, and writing parts of the test suite.

That doesn't transfer responsibility. The design decisions, the measurements,
and every claim in this repository are ours. Anything wrong is our error.

## License

None. This is published for reading and citation, not reuse — no licence is
granted, so all rights are reserved by default. Ask if you want to use part of
it.

That's deliberate rather than an oversight. Releasing something that looks
deployable for a real election, on a single-participant ceremony, would be
irresponsible.
