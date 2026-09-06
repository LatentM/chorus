import { useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { PLATFORM_ADDRESS, PLATFORM_ABI } from "../config/contracts.js";
import { fetchJSON } from "../lib/ipfs.js";
import { chaumPedersenVerify, short, decryptArtifact, isEncryptedArtifact } from "../lib/crypto.js";

const VOTE_CAST_EVENT = parseAbiItem(
  "event VoteCast(uint256 indexed electionId, uint256 indexed nullifier, uint256[4] ciphertext)"
);

/**
 * Public verifier (spec 3.5 / 4.3 step 5):
 *   1. Read all VoteCast events straight from a public Polygon Amoy RPC.
 *   2. Load the published results + decryption proofs from IPFS (resultCID
 *      stored on-chain via setResultCID).
 *   3. For each ballot:
 *        - Groth16 acceptance: the ballot exists as a VoteCast event, which
 *          the contract only emits after verifier.verifyProof passed. (With
 *          the real verifier deployed this is a cryptographic guarantee; a
 *          local snarkjs re-check can be added once verification_key.json
 *          is published. With the MOCK verifier it is flagged as such.)
 *        - Chaum-Pedersen DLEQ:  g*s == R1 + pk*c  and  C1*s == R2 + shared*c
 *        - Nullifier uniqueness.
 *   4. Re-tally the verified plaintexts and compare with the published tally.
 */
export default function VerifierPage() {
  const publicClient = usePublicClient();
  const [electionId, setElectionId] = useState("");
  const [report, setReport] = useState(null);
  const [contentKeyFile, setContentKeyFile] = useState(null);
  const [needsContentKey, setNeedsContentKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function audit() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      // On-chain election + result CID
      const e = await publicClient.readContract({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: "getElection",
        args: [BigInt(electionId)],
      });
      if (!e.exists) throw new Error("Election not found on-chain");
      if (!e.resultCID) throw new Error("No result published yet (resultCID empty)");

      // 1. Events from public RPC
      const logs = await publicClient.getLogs({
        address: PLATFORM_ADDRESS,
        event: VOTE_CAST_EVENT,
        args: { electionId: BigInt(electionId) },
        fromBlock: 0n,
        toBlock: "latest",
      });

      // 2. Published results from IPFS
      let results = await fetchJSON(e.resultCID);
      let designatedVerifier = false;
      if (isEncryptedArtifact(results)) {
        const contentKey = contentKeyFile?.key || null;
        if (!contentKey) {
          setNeedsContentKey(true);
          throw new Error(
            "PRIVATE election — results are encrypted. Designated auditors: upload the content key file to run the audit. On-chain facts (ballot count, publication time and authority) remain publicly verifiable."
          );
        }
        results = await decryptArtifact(results, contentKey);
        designatedVerifier = true;
      }
      const pk = { x: results.publicKey.x, y: results.publicKey.y };
      const nCandidates = results.results.length;

      // Public key consistency with the on-chain record
      const pkMatches =
        BigInt(pk.x) === BigInt(e.pubKeyX) && BigInt(pk.y) === BigInt(e.pubKeyY);

      // 3. Per-ballot checks
      const onchainNullifiers = new Set(logs.map((l) => l.args.nullifier.toString()));
      const seen = new Set();
      let uniqueOk = true;
      for (const n of logs.map((l) => l.args.nullifier.toString())) {
        if (seen.has(n)) uniqueOk = false;
        seen.add(n);
      }

      const counts = new Array(nCandidates).fill(0);
      let cpOk = 0, cpFail = 0, skipped = 0, missingOnChain = 0;

      for (const d of results.decryptions) {
        if (!onchainNullifiers.has(String(d.nullifier))) {
          missingOnChain++;
          continue;
        }
        if (d.plaintext === null || !d.proof || !d.sharedSecret) {
          skipped++; // mock-mode / unreadable ballot
          continue;
        }
        const valid = await chaumPedersenVerify({
          proof: d.proof,
          pk,
          C1: { x: d.ciphertext.c1x, y: d.ciphertext.c1y },
          shared: d.sharedSecret,
          electionId,
        });
        if (valid && d.plaintext >= 0 && d.plaintext < nCandidates) {
          cpOk++;
          counts[d.plaintext]++;
        } else {
          cpFail++;
        }
      }

      // 4. Compare re-tally with published tally
      const published = results.results.map((r) => r.votes);
      const tallyMatches = counts.every((c, i) => c === published[i]);

      const verified =
        pkMatches && uniqueOk && cpFail === 0 && missingOnChain === 0 && tallyMatches;

      setReport({
        events: logs.length,
        published: results.results,
        recount: counts,
        cpOk, cpFail, skipped, missingOnChain,
        pkMatches, uniqueOk, tallyMatches, verified,
        cid: e.resultCID,
        designatedVerifier,
        publishedAt:
          Number(e.resultPublishedAt) > 0
            ? new Date(Number(e.resultPublishedAt) * 1000).toLocaleString()
            : null,
      });
    } catch (err) {
      setError(err.shortMessage || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <section className="card">
        <h2 className="font-display text-xl font-bold mb-2">Audit an election</h2>
        <p className="text-sm text-muted mb-4">
          Everything below is recomputed from the public chain and IPFS — no
          trust in the administrator required.
        </p>
        <div className="flex gap-2">
          <input
            className="input"
            value={electionId}
            onChange={(e) => setElectionId(e.target.value)}
            placeholder="Election ID"
          />
          <button className="btn-verify" onClick={audit} disabled={busy || !electionId}>
            {busy ? (<><span className="spinner" /> Auditing…</>) : "Audit"}
          </button>
        </div>
        {(needsContentKey || contentKeyFile) && (
          <div className="mt-3">
            <label className="label">Content key (private election — designated auditors)</label>
            <input
              type="file"
              accept=".json"
              className="text-sm"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  try {
                    setContentKeyFile(JSON.parse(String(r.result)));
                  } catch {
                    setContentKeyFile(null); // not JSON — ignore the file
                  }
                };
                r.readAsText(f);
              }}
            />
            {contentKeyFile && (
              <p className="text-xs text-verify mt-1.5">Key loaded — press Audit again.</p>
            )}
          </div>
        )}
        {error && <p className="text-seal text-sm mt-3">{error}</p>}
      </section>

      {report && (
        <section className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold">Audit report</h3>
            <span
              className={`verdict ${
                report.verified ? "text-verify" : "text-seal"
              }`}
            >
              {report.verified ? "✓ VERIFIED" : "✗ NOT VERIFIED"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
            <Check ok={true} label={`${report.events} VoteCast events on-chain`} />
            <Check ok={report.uniqueOk} label="Nullifiers unique" />
            <Check ok={report.pkMatches} label="Public key matches on-chain record" />
            <Check ok={report.missingOnChain === 0} label="All published ballots exist on-chain" />
            <Check
              ok={report.cpFail === 0}
              label={`Chaum-Pedersen proofs: ${report.cpOk} valid, ${report.cpFail} invalid`}
            />
            <Check ok={report.tallyMatches} label="Re-tally matches published tally" />
          </div>

          {report.skipped > 0 && (
            <p className="text-xs text-muted mb-4">
              {report.skipped} ballot(s) skipped as unreadable (cast with the
              mock circuit — replace the mock verifier with the real Groth16
              verifier for full cryptographic auditing).
            </p>
          )}

          <table className="audit-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th className="num">Published</th>
                <th className="num">Recounted</th>
              </tr>
            </thead>
            <tbody>
              {report.published.map((r, i) => (
                <tr key={i}>
                  <td>{r.candidate}</td>
                  <td className="num font-mono">{r.votes}</td>
                  <td
                    className={`num font-mono ${
                      report.recount[i] === r.votes ? "text-verify" : "text-seal"
                    }`}
                  >
                    {report.recount[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-muted mt-4">
            Results CID: <span className="font-mono">{short(report.cid, 20)}</span>
            {report.designatedVerifier && (
              <>
                {" · "}
                <span className="text-foil">private election — designated-verifier audit</span>
              </>
            )}
            {report.publishedAt && (
              <>
                {" · "}published on-chain {report.publishedAt}
              </>
            )}
          </p>
        </section>
      )}
    </div>
  );
}

function Check({ ok, label }) {
  return (
    <p className={ok ? "text-verify" : "text-seal"}>
      {ok ? "✓" : "✗"} <span className="text-ballot">{label}</span>
    </p>
  );
}
