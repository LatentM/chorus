// Chorus backend — four small services in one Node process:
//
//   POST /pin        Pinata proxy: pins JSON to IPFS with the JWT held
//                    SERVER-side, so the credential never ships in the
//                    browser bundle. Falls back to mock CIDs without a JWT.
//   GET  /ipfs/:cid  Gateway proxy with fallbacks (and mock-store reads).
//   POST /relay      GASLESS VOTING relayer: accepts a ballot (proof +
//                    public signals) and submits castVote paying the gas.
//                    Sound because castVote never depends on msg.sender —
//                    identity is the nullifier, eligibility is the proof.
//   GET  /elections  Event indexer: cached ElectionCreated list for
//                    instant election discovery without client log scans.
//   GET  /health     Relayer balance, indexer position, config flags.
//
// Run: cp .env.example .env && npm install && npm start
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { createHash } from "node:crypto";

const {
  PORT = 8787,
  RPC_URL = "http://127.0.0.1:8545",
  PLATFORM_ADDRESS,
  RELAYER_PRIVATE_KEY,
  PINATA_JWT,
  DEPLOY_BLOCK = "0",
  // Comma-separated origins allowed to call this service.
  //   3000 = `npm run dev`      (port set in frontend/vite.config.js)
  //   4173 = `npx vite preview` (production build)
  // Set to your deployed frontend URL in production.
  ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:4173,http://127.0.0.1:4173",
  // Behind a reverse proxy (nginx, Render, Fly), set to "1" so req.ip is
  // the client and not the proxy — otherwise everyone shares one rate limit.
  TRUST_PROXY = "0",
} = process.env;

const ABI = [
  "event ElectionCreated(uint256 indexed electionId, bytes32 merkleRoot, uint256 startTime, uint256 endTime, string metadataCid)",
  "function castVote(uint256 electionId, uint256 nullifier, uint256[4] ciphertext, uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[9] input)",
];

const app = express();
if (TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");

const origins = ALLOWED_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: origins, methods: ["GET", "POST"] }));
app.use(express.json({ limit: "2mb" }));

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = RELAYER_PRIVATE_KEY
  ? new ethers.Wallet(RELAYER_PRIVATE_KEY, provider)
  : null;
const readContract = PLATFORM_ADDRESS
  ? new ethers.Contract(PLATFORM_ADDRESS, ABI, provider)
  : null;

if (!PLATFORM_ADDRESS)
  console.warn(
    "[backend] PLATFORM_ADDRESS not set — /relay and /elections disabled",
  );

/* ------------------------------ rate limiting --------------------------- */
// Sliding window per IP, per route. Evicted every window so memory is bounded.
const buckets = new Map(); // `${route}:${ip}` -> number[]
function limited(route, ip, max, windowMs = 60_000) {
  const key = `${route}:${ip}`;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) {
    const live = arr.filter((t) => now - t < 60_000);
    if (live.length) buckets.set(k, live);
    else buckets.delete(k);
  }
}, 60_000).unref();

const rateLimit = (route, max) => (req, res, next) =>
  limited(route, req.ip || "?", max)
    ? res.status(429).json({ error: "Rate limited" })
    : next();

/* ------------------------------ IPFS: pin ------------------------------- */
const mockStore = new Map(); // mock CID -> content (dev fallback)

app.post("/pin", rateLimit("pin", 20), async (req, res) => {
  try {
    const { content, name = "chorus.json" } = req.body || {};
    if (content === undefined)
      return res.status(400).json({ error: "content required" });
    if (typeof name !== "string" || name.length > 120)
      return res.status(400).json({ error: "invalid name" });

    if (!PINATA_JWT) {
      const cid =
        "QmMOCK" +
        createHash("sha256")
          .update(JSON.stringify(content))
          .digest("hex")
          .slice(0, 40);
      mockStore.set(cid, content);
      return res.json({ cid, mock: true });
    }
    const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataMetadata: { name },
        pinataContent: content,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      // Log the body server-side; never return a provider error to the client.
      console.error("pinata:", r.status, await r.text());
      return res
        .status(502)
        .json({ error: `Pinata rejected the pin (${r.status})` });
    }
    const j = await r.json();
    res.json({ cid: j.IpfsHash });
  } catch (e) {
    console.error("pin:", e.message);
    res.status(502).json({ error: "Pinning failed" });
  }
});

/* ------------------------------ IPFS: fetch ----------------------------- */
const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];
// CIDv0 (Qm + 44 base58) or CIDv1 (b + base32). Mock CIDs are QmMOCK + hex.
// Validated before any fetch so this is not an open proxy.
const CID_RE =
  /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|QmMOCK[0-9a-f]{40}|b[a-z2-7]{50,})$/;

app.get("/ipfs/:cid", rateLimit("ipfs", 60), async (req, res) => {
  const { cid } = req.params;
  if (!CID_RE.test(cid)) return res.status(400).json({ error: "Invalid CID" });
  if (mockStore.has(cid)) return res.json(mockStore.get(cid));
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g + cid, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return res.json(await r.json());
    } catch {
      /* try next gateway */
    }
  }
  res.status(404).json({ error: "CID not resolvable" });
});

/* --------------------------- gasless relayer ---------------------------- */
const isUintString = (v) => typeof v === "string" && /^\d{1,78}$/.test(v);
const isUintArray = (v, n) =>
  Array.isArray(v) && v.length === n && v.every(isUintString);

app.post("/relay", rateLimit("relay", 30), async (req, res) => {
  try {
    if (!relayerWallet || !PLATFORM_ADDRESS)
      return res.status(503).json({ error: "Relayer not configured" });

    const { electionId, nullifier, ciphertext, a, b, c, input } =
      req.body || {};
    // Shape validation only — the CONTRACT is the security boundary: it
    // checks the window, nullifier, stored parameters, and the Groth16 proof.
    // Values must arrive as decimal strings; uint256 does not fit in a JS number.
    if (
      !isUintString(String(electionId ?? "")) || // election 0 is valid
      !isUintString(String(nullifier ?? "")) ||
      !isUintArray(ciphertext, 4) ||
      !isUintArray(a, 2) ||
      !Array.isArray(b) ||
      b.length !== 2 ||
      !b.every((row) => isUintArray(row, 2)) ||
      !isUintArray(c, 2) ||
      !isUintArray(input, 9)
    )
      return res.status(400).json({ error: "Malformed ballot payload" });

    const args = [
      BigInt(electionId),
      BigInt(nullifier),
      ciphertext.map(BigInt),
      a.map(BigInt),
      [b[0].map(BigInt), b[1].map(BigInt)],
      c.map(BigInt),
      input.map(BigInt),
    ];
    const contract = new ethers.Contract(PLATFORM_ADDRESS, ABI, relayerWallet);
    // Dry-run first so invalid ballots cost the relayer nothing.
    await contract.castVote.staticCall(...args);
    const tx = await contract.castVote(...args);
    res.json({ txHash: tx.hash });
  } catch (e) {
    // Revert reasons are safe and useful to surface ("Already voted", etc.)
    res
      .status(400)
      .json({ error: e.reason || e.shortMessage || "Relay failed" });
  }
});

/* ----------------------------- event indexer ---------------------------- */
// Incremental: only scans blocks newer than the last one seen.
let electionsCache = [];
let lastBlock = Math.max(0, Number(DEPLOY_BLOCK) - 1);

async function reindex() {
  if (!readContract) return;
  try {
    const head = await provider.getBlockNumber();
    if (head <= lastBlock) return;
    const logs = await readContract.queryFilter(
      readContract.filters.ElectionCreated(),
      lastBlock + 1,
      head,
    );
    for (const l of logs) {
      const id = l.args.electionId.toString();
      if (electionsCache.some((e) => e.id === id)) continue;
      electionsCache.push({
        id,
        metadataCid: l.args.metadataCid,
        startTime: l.args.startTime.toString(),
        endTime: l.args.endTime.toString(),
        block: l.blockNumber,
      });
    }
    lastBlock = head;
  } catch (e) {
    // A chain reset (local Hardhat restart) makes `head` go backwards.
    // Start over so stale elections from the old chain don't linger.
    if (/block|invalid/i.test(e.message)) {
      lastBlock = -1;
      electionsCache = [];
    }
    console.error("indexer:", e.message);
  }
}
setInterval(reindex, 15_000).unref();
reindex();

app.get("/elections", (_req, res) => res.json(electionsCache));

app.get("/health", async (_req, res) => {
  let relayerBalance = null;
  try {
    if (relayerWallet)
      relayerBalance = ethers.formatEther(
        await provider.getBalance(relayerWallet.address),
      );
  } catch {
    /* chain unreachable — reported as null */
  }
  res.json({
    ok: true,
    relayer: !!relayerWallet,
    relayerBalance,
    pinata: !!PINATA_JWT,
    indexed: electionsCache.length,
    lastBlock,
  });
});

const server = app.listen(PORT, () =>
  console.log(
    `Chorus backend on :${PORT} · relayer=${!!relayerWallet} · pinata=${!!PINATA_JWT} · origins=${origins.join(",")}`,
  ),
);
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => server.close(() => process.exit(0)));
