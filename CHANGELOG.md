# Changelog

## 2026-09-02 — Release-readiness pass (TrustVote → Chorus)

Base: the July 26 snapshot. Every change below is listed so it can be merged
against a diverged local copy. Verified in CI-equivalent runs: 13/13 contract
tests, ESLint clean, Vite build clean, backend boots and passes `/health`.

### Renamed
- **TrustVote → Chorus** everywhere (22 files). Root folder is now `chorus/`.
- Signature domain `"Chorus Election: <id>"` in `frontend/src/lib/crypto.js`
  and `scripts/deriveCommitments.js` (must match). **Existing voter
  commitments are invalidated** — everyone re-registers.
- Share/key file discriminators `{ chorus: "key-share" | "content-key" }` and
  download filenames `chorus-election-*`. **Previously downloaded share files
  will not load.** `.gitignore` patterns moved in the same change so downloaded
  secrets stay ignored.

### Fixed
- `frontend/src/pages/VotePage.jsx` — `gasless` state was used but never
  declared (ReferenceError after proof generation). Third instance of this
  bug class; ESLint now catches it.
- `frontend/src/pages/AdminPage.jsx` — trustee tally refuses shares from
  different elections instead of combining them into a garbage key.
- `contracts/package.json` — `deploy:local` now passes `--network localhost`.
  Without it, Hardhat deployed to a throwaway in-memory chain and printed a
  success message the running node never saw.
- `package.json` — `install:all` now includes `backend/`.
- `backend/server.js` — `if (!electionId)` rejected election ID 0.
- Three cosmetic lint errors (unescaped apostrophes, empty catch).

### Changed
- **Gasless voting is now the default** when `VITE_BACKEND_URL` is set and the
  relayer reports healthy. The opt-in checkbox is gone; an "advanced: submit
  from my own wallet" override remains. Rationale: relaying hides *which
  wallets voted* — with direct submission the voter's address is the `from`
  on `castVote` forever.
- Proof generation and submission are separate steps in `VotePage.jsx`. A
  failed submission keeps the proof; the voter is asked before any fallback
  to a paid wallet transaction, and the same proof is reused. Relayer *rejections*
  (400 with a revert reason) are surfaced, not retried.

### Hardened
- `backend/server.js`
  - per-route rate limits on `/pin`, `/ipfs`, `/relay`; bucket map evicts
  - CID format validated before any gateway fetch (no open proxy)
  - CORS restricted to `ALLOWED_ORIGINS` (new env var; default = Vite dev)
  - `TRUST_PROXY` env var for correct per-IP limits behind a reverse proxy
  - relay payload validated as decimal uint strings
  - Pinata error bodies logged server-side, not returned to clients
  - indexer is incremental (scans only new blocks) and resets on chain reset
  - `/health` reports relayer balance and indexer position
  - graceful SIGINT/SIGTERM shutdown
- `contracts/contracts/Groth16Verifier.sol` — mock now exposes
  `IS_MOCK_VERIFIER()`.
- `contracts/scripts/deploy.js` — detects the mock and **refuses to deploy it
  to any non-local chain** unless `ALLOW_MOCK_VERIFIER=1`.

### Added (measurement & deployment)
- `DEPLOYMENT.md` — evaluation, real-verifier swap, Amoy/mainnet with measured gas.
- `contracts/hardhat.config.js` — gas reporter (`REPORT_GAS=true npx hardhat test`).
- `contracts/scripts/deploy.js` — prints gas for both deployments.
- `frontend/src/workers/prove.worker.js` — times `fullProve`, logs seconds.
- `frontend/src/pages/VotePage.jsx` — logs `gasUsed` from the receipt.
- `scripts/benchProve.mjs` (`npm run bench`) — self-contained proof benchmark.

### Added
- `LICENSE` (MIT), `.nvmrc` (20)
- `.github/workflows/ci.yml` — contracts test · frontend lint+build · backend boot
- `frontend/eslint.config.js` with `no-undef` as an error; `npm run lint`
- README: honest status block, threat-model table, deployment guards,
  development section. Removed the 10-week plan (spec scaffolding).

### Design
- "Cyanotype" system: `tailwind.config.js`, `index.css`, `index.html`,
  `App.jsx`, `Landing.jsx`, `main.jsx`. Token names unchanged, so
  `VotePage`, `AdminPage`, `VerifierPage` needed no styling edits.
  `seal` = failure, `verify` = pass, `foil` = attested; never decorative.

### Still open (cannot be done from a sandbox)
- Replace the mock `Groth16Verifier.sol` with your ceremony output.
- Multi-party trusted setup before any binding use.
- Fill `OWNER` in the README CI badge URL after pushing.
- Set `ALLOWED_ORIGINS` in `backend/.env` to your deployed frontend.
