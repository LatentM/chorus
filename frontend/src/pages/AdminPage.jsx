import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { parseAbiItem } from "viem";
import { PLATFORM_ADDRESS, PLATFORM_ABI } from "../config/contracts.js";
import { uploadJSON, fetchJSON, registerElection, listElections } from "../lib/ipfs.js";
import {
  buildCommitmentTree,
  generateElGamalKeypair,
  encryptWithPassword,
  decryptWithPassword,
  decryptVote,
  chaumPedersenProve,
  getBabyJub,
  downloadJSON,
  short,
} from "../lib/crypto.js";

const VOTE_CAST_EVENT = parseAbiItem(
  "event VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256[4] ciphertext)"
);

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { data: owner } = useReadContract({
    address: PLATFORM_ADDRESS,
    abi: PLATFORM_ABI,
    functionName: "owner",
  });
  const isAdmin =
    isConnected && owner && address?.toLowerCase() === owner.toLowerCase();

  if (!isConnected)
    return <p className="card text-muted">Connect the admin wallet to continue.</p>;
  if (owner && !isAdmin)
    return (
      <p className="card text-seal">
        Connected wallet is not the platform owner ({short(owner)}). Admin
        functions are onlyOwner on-chain.
      </p>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CreateElectionWizard />
      <div className="space-y-6">
        <MonitorCard />
        <TallyCard />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Election Wizard (spec 8.3)                                   */
/* ------------------------------------------------------------------ */
function CreateElectionWizard() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [electionId, setElectionId] = useState("");
  const [title, setTitle] = useState("");
  const [candidatesText, setCandidatesText] = useState("Alice\nBob");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [commitments, setCommitments] = useState([]);
  const [password, setPassword] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const push = (m) => setLog((l) => [...l, m]);

  // Voter COMMITMENTS collected during the registration phase — one
  // decimal (or 0x-hex) bigint per line. Voters derive theirs in the
  // "Register" tab; the CLI equivalent is scripts/deriveCommitments.js.
  function onCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = [];
      for (const line of String(reader.result).split(/\r?\n/)) {
        const v = line.trim();
        if (!v) continue;
        try {
          rows.push(BigInt(v).toString());
        } catch {
          /* skip non-numeric lines (headers etc.) */
        }
      }
      setCommitments(rows);
    };
    reader.readAsText(file);
  }

  async function create() {
    setBusy(true);
    setError("");
    setLog([]);
    try {
      if (!commitments.length)
        throw new Error("Upload a commitments CSV first (see Register tab / scripts/deriveCommitments.js)");
      if (!password) throw new Error("Set a password to protect the decryption key");
      const candidates = candidatesText
        .split(/\r?\n/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (candidates.length < 2) throw new Error("Need at least two candidates");

      // 1. Fixed-depth-20 Merkle tree over commitments → IPFS
      push(`Building depth-20 Poseidon Merkle tree for ${commitments.length} commitments…`);
      const tree = await buildCommitmentTree(commitments);
      push(`Root ${short(tree.root)} — uploading tree to IPFS…`);
      const merkleTreeCid = await uploadJSON(tree, `tree-${electionId}.json`);
      push(`Tree CID: ${merkleTreeCid}`);

      // 2. ElGamal keypair client-side, AES-GCM encrypt sk, download vault
      push("Generating BabyJubJub ElGamal keypair…");
      const keys = await generateElGamalKeypair();
      const vault = await encryptWithPassword(keys.sk, password);
      downloadJSON(
        { electionId, pkX: keys.pkX, pkY: keys.pkY, encryptedSk: vault },
        `trustvote-election-${electionId}-key.json`
      );
      push("Encrypted private key downloaded — store it OFFLINE.");

      // 3. Metadata → IPFS
      const metadata = {
        electionId: Number(electionId),
        title,
        candidates,
        merkleTreeCid,
        pubKey: { x: keys.pkX, y: keys.pkY },
        startTime: toUnix(start),
        endTime: toUnix(end),
      };
      const metadataCid = await uploadJSON(metadata, `meta-${electionId}.json`);
      push(`Metadata CID: ${metadataCid}`);

      // 4. createElection on-chain
      push("Calling createElection…");
      const rootHex = "0x" + BigInt(tree.root).toString(16).padStart(64, "0");
      const hash = await writeContractAsync({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "createElection",
        args: [
          BigInt(electionId),
          rootHex,
          BigInt(toUnix(start)),
          BigInt(toUnix(end)),
          BigInt(keys.pkX),
          BigInt(keys.pkY),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      registerElection({ id: Number(electionId), title, metadataCid });
      push(`Election #${electionId} created ✓ (tx ${short(hash)})`);
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="font-display text-xl font-bold mb-4">Create election</h2>
      <div className="grid gap-3">
        <div>
          <label className="label">Election ID (uint)</label>
          <input className="input" value={electionId} onChange={(e) => setElectionId(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Student Council 2026" />
        </div>
        <div>
          <label className="label">Candidates (one per line)</label>
          <textarea className="input h-20" value={candidatesText} onChange={(e) => setCandidatesText(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start</label>
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End</label>
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">
            Voter commitments CSV (one commitment per line — collected in the
            registration phase via the Register tab or scripts/deriveCommitments.js)
          </label>
          <input className="input" type="file" accept=".csv,.txt" onChange={onCsv} />
          {commitments.length > 0 && (
            <p className="text-xs text-verify mt-1">
              {commitments.length} commitments loaded
            </p>
          )}
        </div>
        <div>
          <label className="label">Password for decryption-key vault (AES-GCM)</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-seal" onClick={create} disabled={busy || !electionId || !start || !end}>
          {busy ? "Creating…" : "Build tree · upload · createElection"}
        </button>
      </div>
      {log.length > 0 && (
        <ol className="mt-4 space-y-1 text-xs font-mono text-muted">
          {log.map((m, i) => <li key={i}>· {m}</li>)}
        </ol>
      )}
      {error && <p className="text-seal text-sm mt-3">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Monitor card                                                        */
/* ------------------------------------------------------------------ */
function MonitorCard() {
  const publicClient = usePublicClient();
  const registry = useMemo(() => listElections(), []);
  const [electionId, setElectionId] = useState(registry[0]?.id?.toString() ?? "");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const e = await publicClient.readContract({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "getElection",
        args: [BigInt(electionId)],
      });
      if (!e.exists) throw new Error("Election not found");
      const logs = await publicClient.getLogs({
        address: PLATFORM_ADDRESS,
        event: VOTE_CAST_EVENT,
        args: { electionId: BigInt(electionId) },
        fromBlock: 0n,
        toBlock: "latest",
      });
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(e.endTime) - now;
      setStats({
        votes: logs.length,
        remaining:
          remaining > 0
            ? `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`
            : "ended",
        resultCID: e.resultCID || "—",
      });
    } catch (err) {
      setError(err.shortMessage || err.message);
    }
  }

  return (
    <section className="card">
      <h2 className="font-display text-xl font-bold mb-4">Monitor</h2>
      <div className="flex gap-2 mb-3">
        <input className="input" value={electionId} onChange={(e) => setElectionId(e.target.value)} placeholder="Election ID" />
        <button className="btn-ghost" onClick={refresh} disabled={!electionId}>Refresh</button>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <Stat k="Ballots cast" v={stats.votes} />
          <Stat k="Time remaining" v={stats.remaining} />
          <div className="col-span-2">
            <p className="label">Result CID</p>
            <p className="mono-chip">{stats.resultCID}</p>
          </div>
        </div>
      )}
      {error && <p className="text-seal text-sm">{error}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tally card — browser port of scripts/tally.js                       */
/* ------------------------------------------------------------------ */
function TallyCard() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const registry = useMemo(() => listElections(), []);
  const [electionId, setElectionId] = useState(registry[0]?.id?.toString() ?? "");
  const [keyFile, setKeyFile] = useState(null);
  const [password, setPassword] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const push = (m) => setLog((l) => [...l, m]);

  function onKeyFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setKeyFile(JSON.parse(String(reader.result)));
    reader.readAsText(f);
  }

  async function runTally() {
    setBusy(true);
    setError("");
    setLog([]);
    try {
      if (!keyFile) throw new Error("Upload the election key vault JSON");
      push("Decrypting private key vault…");
      const sk = await decryptWithPassword(keyFile.encryptedSk, password);

      const entry = registry.find((r) => String(r.id) === String(electionId));
      const meta = entry?.metadataCid ? await fetchJSON(entry.metadataCid) : null;
      const candidates = meta?.candidates ?? Array.from({ length: 10 }, (_, i) => `Candidate ${i}`);

      push("Fetching VoteCast events…");
      const logs = await publicClient.getLogs({
        address: PLATFORM_ADDRESS,
        event: VOTE_CAST_EVENT,
        args: { electionId: BigInt(electionId) },
        fromBlock: 0n,
        toBlock: "latest",
      });
      push(`${logs.length} ballots found. Decrypting…`);

      const babyJub = await getBabyJub();
      const F = babyJub.F;
      const counts = new Array(candidates.length).fill(0);
      const decryptions = [];

      for (const l of logs) {
        const [c1x, c1y, c2x, c2y] = l.args.ciphertext.map(String);
        const ct = { c1x, c1y, c2x, c2y };
        const { vote, shared } = await decryptVote(ct, sk, candidates.length);
        let proof = null;
        let sharedOut = null;
        if (vote !== null && shared) {
          counts[vote]++;
          const pkP = [F.e(BigInt(keyFile.pkX)), F.e(BigInt(keyFile.pkY))];
          const C1P = [F.e(BigInt(c1x)), F.e(BigInt(c1y))];
          proof = await chaumPedersenProve(sk, C1P, shared, pkP, electionId);
          sharedOut = {
            x: F.toObject(shared[0]).toString(),
            y: F.toObject(shared[1]).toString(),
          };
        } else {
          push(`! undecodable ciphertext (mock-proof ballot?) — recorded as unreadable`);
        }
        decryptions.push({
          nullifier: l.args.nullifier.toString(),
          ciphertext: ct,
          plaintext: vote,
          sharedSecret: sharedOut,
          proof,
        });
      }

      const results = {
        electionId: Number(electionId),
        publicKey: { x: keyFile.pkX, y: keyFile.pkY },
        results: candidates.map((candidate, i) => ({ candidate, index: i, votes: counts[i] })),
        decryptions,
      };
      push(`Tally: ${counts.join(" / ")} — uploading results to IPFS…`);
      const cid = await uploadJSON(results, `results-${electionId}.json`);
      push(`Results CID: ${cid} — publishing on-chain…`);
      const hash = await writeContractAsync({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "setResultCID",
        args: [BigInt(electionId), cid],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      downloadJSON(results, `results-${electionId}.json`);
      push("Result published ✓ — verifiers can now audit.");
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="font-display text-xl font-bold mb-4">Tally & publish</h2>
      <div className="grid gap-3">
        <input className="input" value={electionId} onChange={(e) => setElectionId(e.target.value)} placeholder="Election ID" />
        <div>
          <label className="label">Election key vault (downloaded at creation)</label>
          <input className="input" type="file" accept=".json" onChange={onKeyFile} />
        </div>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Vault password" />
        <button className="btn-verify" onClick={runTally} disabled={busy || !electionId}>
          {busy ? "Tallying…" : "Decrypt · prove · publish"}
        </button>
        <p className="text-xs text-muted">
          Same logic as <span className="font-mono">scripts/tally.js</span> —
          use the CLI for large elections.
        </p>
      </div>
      {log.length > 0 && (
        <ol className="mt-4 space-y-1 text-xs font-mono text-muted">
          {log.map((m, i) => <li key={i}>· {m}</li>)}
        </ol>
      )}
      {error && <p className="text-seal text-sm mt-3">{error}</p>}
    </section>
  );
}

function Stat({ k, v }) {
  return (
    <div>
      <p className="label">{k}</p>
      <p className="font-display text-2xl font-bold">{v}</p>
    </div>
  );
}
const toUnix = (dtLocal) => Math.floor(new Date(dtLocal).getTime() / 1000);
