# Deployment & measurement guide

Three things, in the order you should do them:

1. [Fill the paper's evaluation](#1-fill-the-evaluation) — all local, no POL needed
2. [Ship the real Groth16 verifier](#2-ship-the-real-groth16-verifier) — replaces the mock
3. [Deploy to Amoy, then mainnet](#3-deploy-amoy-then-mainnet) — and how much POL that actually takes

---

## 1. Fill the evaluation

Every number in the paper's Table 2 is measurable locally. Nothing here
touches a public network.

### 1a. Circuit constraints and key size

```bash
cd circuits
npx snarkjs r1cs info build/VotingCircuit.r1cs     # "# of Constraints"
ls -la build/circuit_final.zkey                     # proving-key size
ls -la build/VotingCircuit_js/VotingCircuit.wasm    # wasm size
```

### 1b. Proof generation time (browser — the number the paper reports)

The Voter tab now prints it after every vote:

```
Proof generated ✓ (4.21 s)
```

That is witness + proof (`snarkjs fullProve`) in the Web Worker. Cast **ten
votes** with ten registered voters on local Hardhat, write down the ten
times, report the **median**. State the machine and browser in §6 "Setup".

Sanity check from Node (not what the paper reports — browser wasm is slower):

```bash
cd scripts && npm install && npm run bench          # 10 runs, synthetic valid input
```

### 1c. Gas

Two sources, because the mock verifier hides the real `castVote` cost.

**Everything except `castVote`** — from the test suite, verifier-independent:

```bash
cd contracts
REPORT_GAS=true npx hardhat test
```

Measured on this codebase:

| function | gas |
|---|---|
| `VotingPlatform` deploy | 1,218,224 |
| `createElection` | ~189,030 |
| `setResultCID` | ~77,300 |
| `setElectionManager` | ~50,054 |
| `castVote` (mock verifier) | 71,716 — **do not report this** |

**`castVote` with the real verifier** — after step 2, the Voter tab prints:

```
Vote recorded on-chain ✓ · gas used 3xxxxx
```

Report that. Expect roughly 280–330k; the difference from 72k is the
pairing check plus ~6k per public signal.

**Verifier deployment gas** — after step 2, `deploy.js` prints it:

```
Groth16Verifier deployed to: 0x… · gas 1xxxxxx
VotingPlatform deployed to:  0x… · gas 1218224
Total deployment gas: …
```

### 1d. Tally and audit time

Time from pressing "Run tally" to the result CID appearing, and from
pressing "Verify" to the verdict. Your `push()`/`log()` calls already have
timestamps in DevTools if you enable "Show timestamps" in the console
settings. Measure at the largest N you can realistically produce —
**ten and fifty ballots are honest; don't claim 1,000 you didn't run.**
Change the `N` in Table 2 to match.

---

## 2. Ship the real Groth16 verifier

The repo ships a mock that accepts every proof. `deploy.js` refuses to
deploy it to a public chain. This is how you replace it.

Prerequisite: you've run the ceremony in `circuits/README.md` and have
`circuits/build/circuit_final.zkey`. If not, do that first — it's the
`powersoftau` → `groth16 setup` → `zkey contribute` sequence.

```bash
cd circuits

# 1. Export the verifier contract OVER the mock. Same filename, same
#    contract name (snarkjs emits `contract Groth16Verifier`), same
#    verifyProof(uint[2],uint[2][2],uint[2],uint[9]) signature.
npx snarkjs zkey export solidityverifier build/circuit_final.zkey \
    ../contracts/contracts/Groth16Verifier.sol

# 2. Browser artifacts — the exact filenames VotePage.jsx fetches.
cp build/VotingCircuit_js/VotingCircuit.wasm ../frontend/public/circuits/
cp build/circuit_final.zkey                  ../frontend/public/circuits/

# 3. Confirm the swap took.
grep -c "IS_MOCK_VERIFIER" ../contracts/contracts/Groth16Verifier.sol   # must print 0
grep -c "pairing"          ../contracts/contracts/Groth16Verifier.sol   # must be > 0

# 4. Compile and test. Tests deploy MockGroth16Verifier by name, so they
#    still pass — the real file only affects deployment.
cd ../contracts && npx hardhat compile && npx hardhat test
```

Then redeploy locally and vote once. Two things must be true:

- `deploy.js` prints **no** "⚠ MOCK" line.
- The vote log says "Real circuit artifacts found — generating Groth16
  proof" rather than "using MOCK proof".

Commit `Groth16Verifier.sol`. **Do not commit** the `.zkey` — it's
gitignored and 10s of MB. The wasm is fine to commit if under a few MB;
otherwise host both and document the URL.

Then delete the "ships a mock" clause from §5 of the paper.

---

## 3. Deploy: Amoy, then mainnet

### How much POL you actually need

Measured, not estimated (see §1c), at Amoy's ~30 gwei floor:

| step | gas | POL |
|---|---|---|
| deploy verifier + platform | ~2.8M | 0.085 |
| `createElection` | 0.19M | 0.006 |
| 10 × `castVote` | ~3.2M | 0.096 |
| `setResultCID` | 0.08M | 0.002 |
| **whole demo** | **~6.3M** | **~0.19** |

**A complete Amoy demo costs about 0.2 POL.** The faucets are not the
constraint you think they are.

### Amoy faucets (September 2026)

| faucet | drip | catch |
|---|---|---|
| faucet.polygon.technology | ~0.5/day | Discord or account login |
| crypto-chief.com/faucet/polygon-amoy | 0.5/day | — |
| QuickNode | 1 drip / 12h, ×2 if you tweet | wallet connect |
| GetBlock | 0.1/day | account |
| ETHGlobal | 0.05/day | login |
| Alchemy | 0.2/day, 0.5 with account | **needs 0.001 ETH on Ethereum mainnet** — skip |

Two faucets, one day, and you have 1 POL — five full demos. The way people
run out is redeploying repeatedly to debug. **Don't. Debug on Hardhat.
Deploy to Amoy once, when it already works.**

```bash
cd contracts
# .env: PRIVATE_KEY=<fresh deployer key>, AMOY_RPC_URL (optional), POLYGONSCAN_API_KEY (optional)
npx hardhat run scripts/deploy.js --network amoy
npx hardhat verify --network amoy <verifierAddress>
npx hardhat verify --network amoy <platformAddress> <verifierAddress>
```

Then `VITE_PLATFORM_ADDRESS` in `frontend/.env`, `PLATFORM_ADDRESS` in
`backend/.env`, restart both. Fund the relayer wallet with ~0.5 POL too if
you're demoing gasless.

### Should you buy POL for mainnet?

The same demo on mainnet costs the same ~0.2 POL. At recent prices that is
a few rupees. **Cost is not the question. Credibility is.**

"Deployed on Polygon mainnet at 0x…, verified on Polygonscan" is a
stronger line in a paper and a portfolio than a testnet address, and it is
permanent. Nothing is at stake in a demo election, so the solo-ceremony
caveat doesn't bite here — it's already stated in the paper.

If you do it:

- Buy roughly **₹500 of POL** on CoinDCX / CoinSwitch / Zebpay (KYC: PAN +
  Aadhaar). That's dozens of POL — headroom for withdrawal fees and many
  demos.
- Withdraw to your deployer wallet **on the Polygon network**. Exchanges
  offer POL on Ethereum too; that's the wrong one and bridging back costs
  more than you bought.
- Use a **fresh wallet** for the deployer. The key goes in `contracts/.env`
  and nowhere else. Never the Hardhat account #0 key.
- Deploy once, verify on Polygonscan, put the address in the paper and the
  README.

`deploy.js` blocks the mock verifier on chain 137 the same way it does on
80002, so step 2 must be done first.

### Recommended order

1. Finish step 1 and step 2 locally.
2. Deploy to Amoy once. Run the full demo. Record real-verifier gas.
3. Fill Table 2.
4. Only then, mainnet — one deployment, verified, cited.
