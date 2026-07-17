import { useMemo, useState } from "react";
import {
  useAccount,
  useSignMessage,
  useWriteContract,
  usePublicClient,
  useChainId,
} from "wagmi";
import { PLATFORM_ADDRESS, PLATFORM_ABI } from "../config/contracts.js";
import { fetchJSON, listElections } from "../lib/ipfs.js";
import {
  deriveVoterCommitment,
  buildMerkleProof,
  deriveSecretKey,
  computeNullifier,
  encryptVote,
  randomScalar,
  voteMessage,
  short,
} from "../lib/crypto.js";

const WASM_URL = "/circuits/VotingCircuit.wasm";
const ZKEY_URL = "/circuits/circuit_final.zkey";

/** Block-explorer tx URL per chain; null when there is none (local node). */
function explorerTxUrl(chainId, tx) {
  switch (chainId) {
    case 137:
      return `https://polygonscan.com/tx/${tx}`;
    case 80002:
      return `https://amoy.polygonscan.com/tx/${tx}`;
    case 11155111:
      return `https://sepolia.etherscan.io/tx/${tx}`;
    default:
      return null; // hardhat local (31337) or unknown chain
  }
}

export default function VotePage() {
  const [mode, setMode] = useState("register"); // register | vote | verify
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Voter actions">
        <button
          className={mode === "register" ? "subtab-on" : "subtab-off"}
          onClick={() => setMode("register")}
        >
          Register
        </button>
        <button
          className={mode === "vote" ? "subtab-on" : "subtab-off"}
          onClick={() => setMode("vote")}
        >
          Cast a ballot
        </button>
        <button
          className={mode === "verify" ? "subtab-on" : "subtab-off"}
          onClick={() => setMode("verify")}
        >
          Verify my vote
        </button>
      </div>
      {mode === "register" ? (
        <RegisterCommitment />
      ) : mode === "vote" ? (
        <CastBallot />
      ) : (
        <VerifyMyVote />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cast ballot — spec 4.2 steps 1..8                                   */
/* ------------------------------------------------------------------ */
function CastBallot() {
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const registry = useMemo(() => listElections(), []);
  const [electionId, setElectionId] = useState(registry[0]?.id?.toString() ?? "");
  const [election, setElection] = useState(null); // on-chain struct
  const [metadata, setMetadata] = useState(null); // ipfs metadata
  const [tree, setTree] = useState(null);
  const [eligible, setEligible] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState([]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  // Step 2 & 3 — load election from chain, then tree/metadata from IPFS
  async function loadElection() {
    setError("");
    setElection(null);
    setMetadata(null);
    setTree(null);
    setEligible(null);
    setReceipt(null);
    try {
      const e = await publicClient.readContract({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "getElection",
        args: [BigInt(electionId)],
      });
      if (!e.exists) throw new Error(`Election ${electionId} not found on-chain`);
      setElection(e);

      const entry = registry.find((r) => String(r.id) === String(electionId));
      if (!entry?.metadataCid)
        throw new Error(
          "No metadata CID known for this election in this browser. Ask the admin for the metadata CID or create the election on this machine."
        );
      const meta = await fetchJSON(entry.metadataCid);
      setMetadata(meta);

      const treeJson = await fetchJSON(meta.merkleTreeCid);
      setTree(treeJson);

    } catch (err) {
      setError(err.message);
    }
  }

  // Eligibility is commitment-based (anonymous): deriving the commitment
  // requires a wallet signature, so it is an explicit user action.
  async function checkRegistration() {
    setError("");
    try {
      const signature = await signMessageAsync({
        message: voteMessage(electionId),
      });
      const secretKey = await deriveSecretKey(signature);
      const { commitment } = await deriveVoterCommitment(secretKey);
      setEligible(buildMerkleProof(tree, commitment) !== null);
    } catch (err) {
      setError(err.shortMessage || err.message);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const open =
    election && now >= Number(election.startTime) && now <= Number(election.endTime);

  // Steps 4..8 — the whole cryptographic pipeline
  async function castVote() {
    setBusy(true);
    setError("");
    setProgress([]);
    const log = (m) => setProgress((p) => [...p, m]);
    try {
      // Step 5 — derive secret by signing the election message
      log("Requesting wallet signature to derive voting secret…");
      const signature = await signMessageAsync({
        message: voteMessage(electionId),
      });
      const secretKey = await deriveSecretKey(signature);

      // Step 3 — merkle proof for the voter COMMITMENT
      // (leaf = Poseidon(BabyPbk(secretKey).Ax), registered pre-election)
      const { commitment } = await deriveVoterCommitment(secretKey);
      const proof = buildMerkleProof(tree, commitment);
      if (!proof)
        throw new Error(
          "Your commitment is not in the voter tree — register it with the admin before the election is created"
        );
      log("Merkle membership proof built ✓");

      // Step 6 — nullifier + ElGamal encryption
      const nullifier = await computeNullifier(secretKey, electionId);
      const r = await randomScalar();
      const ct = await encryptVote(
        candidate,
        election.pubKeyX.toString(),
        election.pubKeyY.toString(),
        r
      );
      log(`Nullifier ${short(nullifier)} · ballot encrypted ✓`);

      // Step 7 — Groth16 proof in a Web Worker (mock fallback without keys)
      const circuitInput = {
        secretKey: secretKey.toString(),
        siblings: proof.siblings.map(String),
        pathIndices: proof.pathIndices.map(String),
        vote: String(candidate),
        encRandomness: r.toString(),
        electionIdInput: String(electionId),
        pubKeyX: election.pubKeyX.toString(),
        pubKeyY: election.pubKeyY.toString(),
      };
      const { a, b, c, publicSignals } = await generateProof(circuitInput, log);

      // Step 8 — submit transaction
      // Public signals: [root, electionId, nullifier, c1x, c1y, c2x, c2y,
      //                  pubKeyX, pubKeyY] — the contract pins 7 & 8 to the
      // on-chain election key. With a REAL proof, use the prover's own
      // signals verbatim; the mock path falls back to JS-computed values
      // (identical by construction — same ElGamal, same r).
      const input = publicSignals ?? [
        BigInt(election.merkleRoot),
        BigInt(electionId),
        nullifier,
        ct.c1x,
        ct.c1y,
        ct.c2x,
        ct.c2y,
        BigInt(election.pubKeyX),
        BigInt(election.pubKeyY),
      ];
      // Ciphertext for the VoteCast event, taken from the same signals the
      // verifier will check, so the emitted ballot always matches the proof.
      const cipher = [input[3], input[4], input[5], input[6]];
      log("Sending castVote transaction…");
      const hash = await writeContractAsync({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "castVote",
        args: [
          BigInt(electionId),
          nullifier,
          cipher,
          a,
          b,
          c,
          input,
        ],
      });
      log("Waiting for confirmation…");
      await publicClient.waitForTransactionReceipt({ hash });
      setReceipt({ nullifier: nullifier.toString(), tx: hash });
      log("Vote recorded on-chain ✓");
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1.4fr]">
      <section className="card">
        <h2 className="font-display text-xl font-bold mb-4">1 · Election</h2>
        <label className="label">Election ID</label>
        <div className="flex gap-2">
          <input
            className="input"
            value={electionId}
            onChange={(e) => setElectionId(e.target.value)}
            placeholder="e.g. 1"
          />
          <button className="btn-ghost" onClick={loadElection} disabled={!electionId}>
            Load
          </button>
        </div>
        {registry.length > 0 && (
          <p className="text-xs text-muted mt-2">
            Known here: {registry.map((r) => `#${r.id} ${r.title}`).join(" · ")}
          </p>
        )}

        {election && (
          <div className="mt-4 space-y-2 text-sm">
            <Row k="Title" v={metadata?.title || "—"} />
            <Row k="Window" v={`${ts(election.startTime)} → ${ts(election.endTime)}`} />
            <Row k="Status" v={open ? "OPEN" : "CLOSED"} accent={open} />
            <Row k="Merkle root" v={short(BigInt(election.merkleRoot))} mono />
            <Row
              k="Registration"
              v={
                !isConnected
                  ? "connect wallet"
                  : eligible === null
                  ? "not checked"
                  : eligible
                  ? "Your commitment is in the voter tree"
                  : "Not registered — commitment not in tree"
              }
              accent={eligible === true}
            />
            {isConnected && tree && eligible === null && (
              <button className="btn-ghost w-full mt-1" onClick={checkRegistration}>
                Check my registration (sign)
              </button>
            )}
          </div>
        )}
        {error && <p className="text-seal text-sm mt-3">{error}</p>}
      </section>

      <section className="card">
        <h2 className="font-display text-xl font-bold mb-4">2 · Ballot</h2>
        {!metadata ? (
          <p className="text-muted text-sm">Load an election to see candidates.</p>
        ) : (
          <>
            <div className="space-y-2 mb-5">
              {metadata.candidates.map((name, i) => (
                <label
                  key={i}
                  className={`ballot-row ${candidate === i ? "ballot-row-on" : ""}`}
                >
                  <input
                    type="radio"
                    name="candidate"
                    className="accent-[#C8502E] w-4 h-4"
                    checked={candidate === i}
                    onChange={() => setCandidate(i)}
                  />
                  <span className="font-mono text-xs text-muted">#{i}</span>
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <button
              className="btn-seal w-full"
              disabled={
                busy || candidate === null || !isConnected || !eligible || !open
              }
              onClick={castVote}
            >
              {busy ? (<><span className="spinner" /> Proving & submitting…</>) : "Cast anonymous vote"}
            </button>
          </>
        )}

        {progress.length > 0 && (
          <ol className="mt-5 space-y-1.5 text-xs font-mono text-muted">
            {progress.map((m, i) => (
              <li key={i} className="log-line">· {m}</li>
            ))}
          </ol>
        )}

        {receipt && (
          <div className="mt-5 stamped text-verify animate-stamp-in">
            <p className="font-display font-black tracking-[0.14em] uppercase mb-3">
              Ballot receipt
            </p>
            <p className="label">Nullifier (save this to verify later)</p>
            <p className="mono-chip mb-2">{receipt.nullifier}</p>
            <p className="label">Transaction</p>
            {explorerTxUrl(chainId, receipt.tx) ? (
              <a
                className="mono-chip block underline"
                href={explorerTxUrl(chainId, receipt.tx)}
                target="_blank"
                rel="noreferrer"
              >
                {receipt.tx}
              </a>
            ) : (
              <p className="mono-chip block">{receipt.tx} (local node — no explorer)</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Try the real Web Worker prover; fall back to a mock proof when the
 *  circuit artifacts (.wasm/.zkey) aren't present (mock verifier accepts). */
async function generateProof(input, log) {
  // Dev servers (Vite) answer 200 + index.html for ANY path (SPA fallback),
  // so a HEAD status check cannot detect missing artifacts. Instead, read the
  // first bytes of the .wasm and verify the WebAssembly magic number
  // "\0asm" (0x00 0x61 0x73 0x6d), and make sure neither URL serves HTML.
  async function artifactPresent(url, checkWasmMagic) {
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-3" },
        cache: "no-store",
      });
      if (!res.ok) return false;
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("text/html")) return false; // SPA fallback page
      if (checkWasmMagic) {
        const buf = new Uint8Array(await res.arrayBuffer());
        return (
          buf.length >= 4 &&
          buf[0] === 0x00 &&
          buf[1] === 0x61 &&
          buf[2] === 0x73 &&
          buf[3] === 0x6d
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  const [wasmOk, zkeyOk] = await Promise.all([
    artifactPresent(WASM_URL, true),
    artifactPresent(ZKEY_URL, false),
  ]);
  const artifactsExist = wasmOk && zkeyOk;

  if (!artifactsExist) {
    log("Circuit artifacts not found — using MOCK proof (mock verifier accepts).");
    return {
      a: [0n, 0n],
      b: [
        [0n, 0n],
        [0n, 0n],
      ],
      c: [0n, 0n],
      publicSignals: null, // caller falls back to JS-computed signals
    };
  }

  log("Real circuit artifacts found — generating Groth16 proof (this can take a minute)…");
  log("Spawning proving worker…");
  const worker = new Worker(
    new URL("../workers/prove.worker.js", import.meta.url),
    { type: "module" }
  );
  const { proof, publicSignals } = await new Promise((resolve, reject) => {
    // Watchdog: if the worker goes silent for 3 minutes, fail loudly rather
    // than leaving the button stuck on "Proving & submitting…" forever.
    let watchdog;
    const kick = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(
        () =>
          reject(
            new Error(
              "Proving stalled (no progress for 3 min). Check the browser console; " +
                "verify frontend/public/circuits/ contains a valid VotingCircuit.wasm " +
                "and circuit_final.zkey from YOUR compiled circuit (stale files from " +
                "an older circuit version also cause this)."
            )
          ),
        180_000
      );
    };
    kick();
    worker.onerror = (e) =>
      reject(new Error(`Proving worker crashed: ${e.message || "see console"}`));
    worker.onmessage = (e) => {
      kick();
      if (e.data.type === "progress") log(e.data.message);
      if (e.data.type === "result") resolve(e.data);
      if (e.data.type === "error") reject(new Error(e.data.message));
    };
    worker.postMessage({ input, wasm: WASM_URL, zkey: ZKEY_URL });
  }).finally(() => worker.terminate());

  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    publicSignals: publicSignals.map(BigInt),
  };
}

/* ------------------------------------------------------------------ */
/*  Register — derive & export the voter commitment (pre-election)      */
/* ------------------------------------------------------------------ */
function RegisterCommitment() {
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [electionId, setElectionId] = useState("");
  const [commitment, setCommitment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function register() {
    setBusy(true);
    setError("");
    setCommitment(null);
    try {
      const signature = await signMessageAsync({
        message: voteMessage(electionId),
      });
      const secretKey = await deriveSecretKey(signature);
      const { commitment: c } = await deriveVoterCommitment(secretKey);
      setCommitment(c.toString());
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl">
      <h2 className="font-display text-xl font-bold mb-2">
        Register for an election
      </h2>
      <p className="text-sm text-muted mb-4">
        Before an election is created, the admin announces its{" "}
        <span className="font-mono">Election ID</span> and collects voter{" "}
        <em>commitments</em>. Your commitment is{" "}
        <span className="font-mono text-xs">
          Poseidon(BabyJubJub-pubkey.x)
        </span>{" "}
        derived from a wallet signature — it reveals nothing about your
        address, and only you can later produce a ZK proof for it. Send the
        value below to the admin through any channel.
      </p>
      <label className="label">Election ID (announced by the admin)</label>
      <div className="flex gap-2 mb-4">
        <input
          className="input"
          value={electionId}
          onChange={(e) => setElectionId(e.target.value)}
          placeholder="e.g. 1"
        />
        <button
          className="btn-seal"
          disabled={!isConnected || !electionId || busy}
          onClick={register}
        >
          {busy ? (<><span className="spinner" /> Signing…</>) : "Derive commitment (sign)"}
        </button>
      </div>
      {!isConnected && (
        <p className="text-xs text-muted">Connect a wallet to register.</p>
      )}
      {commitment && (
        <div className="stamped text-verify animate-stamp-in">
          <p className="font-display font-black tracking-[0.14em] uppercase mb-3">
            Voter commitment
          </p>
          <p className="mono-chip break-all mb-3">{commitment}</p>
          <button
            className="btn-ghost"
            onClick={() => navigator.clipboard.writeText(commitment)}
          >
            Copy to clipboard
          </button>
          <p className="text-xs text-muted mt-3">
            The same wallet + election ID always derives the same commitment,
            so you can re-derive it any time by signing again.
          </p>
        </div>
      )}
      {error && <p className="text-seal text-sm mt-3">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Verify my vote — re-derive nullifier & check the event logs         */
/* ------------------------------------------------------------------ */
function VerifyMyVote() {
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const [electionId, setElectionId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const signature = await signMessageAsync({
        message: voteMessage(electionId),
      });
      const secretKey = await deriveSecretKey(signature);
      const nullifier = await computeNullifier(secretKey, electionId);
      const used = await publicClient.readContract({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "nullifiers",
        args: [BigInt(electionId), nullifier],
      });
      setResult({ nullifier: nullifier.toString(), used });
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card max-w-xl">
      <h2 className="font-display text-xl font-bold mb-2">Verify my vote</h2>
      <p className="text-sm text-muted mb-4">
        Sign the same election message again; your nullifier is re-derived
        deterministically and checked against the on-chain record. No one else
        can link it back to your address.
      </p>
      <label className="label">Election ID</label>
      <input
        className="input mb-4"
        value={electionId}
        onChange={(e) => setElectionId(e.target.value)}
        placeholder="e.g. 1"
      />
      <button
        className="btn-verify"
        onClick={verify}
        disabled={!isConnected || !electionId || busy}
      >
        {busy ? (<><span className="spinner" /> Checking…</>) : "Re-derive nullifier & check"}
      </button>
      {result && (
        <div className="mt-5">
          <p className="label">Your nullifier</p>
          <p className="mono-chip mb-3">{result.nullifier}</p>
          <p
            className={`font-medium ${
              result.used ? "text-verify" : "text-seal"
            }`}
          >
            {result.used
              ? "✓ Recorded — your ballot is on-chain."
              : "✗ Not found — no ballot recorded for this nullifier."}
          </p>
        </div>
      )}
      {error && <p className="text-seal text-sm mt-3">{error}</p>}
    </section>
  );
}

/* helpers */
function Row({ k, v, mono, accent }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-leader" aria-hidden="true" />
      <span className={`kv-v ${mono ? "font-mono text-xs" : ""} ${accent ? "text-verify" : ""}`}>
        {v}
      </span>
    </div>
  );
}
const ts = (t) => new Date(Number(t) * 1000).toLocaleString();
