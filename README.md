# TrustVote

A zero-knowledge, blockchain-based voting platform with end-to-end
verifiability. 


## Quick start

### 1. Contracts

```bash
cd contracts
npm install
npx hardhat compile          # ✅ acceptance: compiles
npx hardhat test             # election lifecycle unit tests
```

**Option A — local Hardhat node (recommended for the demo: no faucet, instant, free):**

```bash
npx hardhat node             # terminal 1: local chain on http://127.0.0.1:8545
npx hardhat run scripts/deploy.js --network localhost   # terminal 2
```

Then in MetaMask: add a network manually (RPC `http://127.0.0.1:8545`,
chain id `31337`, currency `ETH`) and *import* one of the private keys the
node printed (account #0 is the deployer/admin) — each comes with 10,000
test ETH. ⚠️ Dev keys only; never use them anywhere real. If you restart the
node later, redeploy and clear MetaMask's activity (Settings → Advanced →
Clear activity tab data) to reset stale nonces.


**Option B — Polygon Amoy** (`.env` needs `PRIVATE_KEY`; POL from
https://faucet.polygon.technology):

```bash
npm run deploy:amoy
```

Whichever you choose, copy the printed `VotingPlatform` address. The frontend
supports all three networks at once — it simply talks to whichever network
your wallet is switched to.

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
