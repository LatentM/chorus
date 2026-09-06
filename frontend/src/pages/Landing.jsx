/**
 * Landing — the thesis page.
 *
 * The signature figure is a Merkle authentication path. It draws itself from a
 * single leaf up to the root while that leaf stays redacted. That is exactly
 * what the circuit proves: this ballot came from a registered voter, and the
 * chain learns nothing else. The figure is the argument, not an ornament.
 */

const LEAF_X = [25, 80, 135, 190, 245, 300, 355, 410];
const L2_X = [52.5, 162.5, 272.5, 382.5];
const L3_X = [107.5, 327.5];
const ROOT_X = 217.5;
const Y = { leaf: 250, l2: 180, l3: 110, root: 45 };
const ME = 2; // the voter's leaf

const seg = (x1, y1, x2, y2) => ({
  d: `M${x1} ${y1}L${x2} ${y2}`,
  len: Math.round(Math.hypot(x2 - x1, y2 - y1)),
});

const PATH = [
  seg(LEAF_X[ME], Y.leaf, L2_X[1], Y.l2),
  seg(L2_X[1], Y.l2, L3_X[0], Y.l3),
  seg(L3_X[0], Y.l3, ROOT_X, Y.root),
];
const DARK = [
  ...LEAF_X.map((x, i) => seg(x, Y.leaf, L2_X[Math.floor(i / 2)], Y.l2)),
  ...L2_X.map((x, i) => seg(x, Y.l2, L3_X[Math.floor(i / 2)], Y.l3)),
  ...L3_X.map((x) => seg(x, Y.l3, ROOT_X, Y.root)),
];

function MerkleFigure() {
  return (
    <svg viewBox="0 0 440 300" className="w-full h-auto" role="img"
         aria-label="A Merkle tree with one leaf's authentication path highlighted from the leaf up to the root, while the leaf's own contents stay hidden.">
      {DARK.map((e, i) => <path key={`d${i}`} d={e.d} className="tree-edge" />)}
      {PATH.map((e, i) => (
        <path key={`l${i}`} d={e.d} className="tree-edge-lit"
              style={{ "--len": e.len, animationDelay: `${0.35 + i * 0.55}s` }} />
      ))}
      {LEAF_X.map((x, i) =>
        i === ME
          ? <rect key={i} x={x - 9} y={Y.leaf - 6} width="18" height="12" rx="1.5" className="tree-leaf-secret" />
          : <rect key={i} x={x - 7} y={Y.leaf - 5} width="14" height="10" rx="1.5" className="tree-node" />
      )}
      {L2_X.map((x, i) => (
        <circle key={i} cx={x} cy={Y.l2} r={i === 1 ? 6 : 4.5}
                className={i === 1 ? "tree-node-lit" : "tree-node"}
                style={i === 1 ? { animationDelay: "0.85s" } : undefined} />
      ))}
      {L3_X.map((x, i) => (
        <circle key={i} cx={x} cy={Y.l3} r={i === 0 ? 6 : 4.5}
                className={i === 0 ? "tree-node-lit" : "tree-node"}
                style={i === 0 ? { animationDelay: "1.4s" } : undefined} />
      ))}
      <circle cx={ROOT_X} cy={Y.root} r="8" className="tree-node-lit" style={{ animationDelay: "1.95s" }} />
      <text x={ROOT_X} y={Y.root - 18} textAnchor="middle" className="tree-caption tree-caption-lit">root · stored on-chain</text>
      <text x={LEAF_X[ME]} y={Y.leaf + 24} textAnchor="middle" className="tree-caption">your leaf</text>
      <text x={LEAF_X[ME]} y={Y.leaf + 36} textAnchor="middle" className="tree-caption">███████</text>
    </svg>
  );
}

const GUARANTEES = [
  { t: "Ballots stay sealed",
    d: "Your choice is encrypted in your own browser before anything leaves it. The chain stores only ciphertext — there is nothing readable to leak, subpoena, or sell.",
    p: "ElGamal · BabyJubJub" },
  { t: "One person, one vote",
    d: "Each ballot carries a nullifier — a one-way serial derived from your secret. A second ballot repeats the serial and the contract refuses it, without ever learning who you are.",
    p: "Poseidon nullifiers" },
  { t: "Anyone can check the count",
    d: "Every ballot is accepted only with a validity proof, and the published tally ships with decryption proofs. The Verifier recounts from public data alone — no permission needed.",
    p: "Groth16 · Chaum-Pedersen" },
];

const STEPS = [
  ["Register", "Sign one message. Your wallet derives an anonymous commitment that joins the voter roll — your address never does."],
  ["Vote", "Pick a candidate. Your browser encrypts the choice and builds a zero-knowledge proof; the contract verifies it before accepting."],
  ["Tally", "After close — and only after close — the encrypted ballots are decrypted, each with a proof the decryption was honest."],
  ["Audit", "Anyone opens the Verifier, recounts from the chain and IPFS, and gets a verdict: VERIFIED, or not."],
];

const LIMITS = [
  ["Trusted setup", "single-participant ceremony"],
  ["Coercion resistance", "not addressed"],
  ["Key custody", "Shamir threshold, untested at scale"],
  ["External audit", "none"],
];

export default function Landing({ onNavigate }) {
  return (
    <div className="space-y-20 pb-6">
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted uppercase mb-5">Zero-knowledge elections</p>
          <h2 className="font-display font-black text-4xl md:text-[3.25rem] mb-6">
            Anyone can check the count.
            <span className="block text-foil">No one can check your ballot.</span>
          </h2>
          <p className="text-muted leading-relaxed max-w-xl">
            Chorus runs elections where no one — not even the operator — can see a
            vote or fake a count. Who may vote, that they vote once, and that the tally
            is honest are all certified by zero-knowledge proofs, checked by the
            blockchain, and re-checkable by anyone.
          </p>
          <div className="flex flex-wrap gap-3 mt-8 mb-10">
            <button className="btn-seal" onClick={() => onNavigate("voter")}>Cast a ballot</button>
            <button className="btn-ghost" onClick={() => onNavigate("verifier")}>Audit an election</button>
            <button className="btn-ghost" onClick={() => onNavigate("admin")}>Run elections</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[["~2s", "proof built in-browser"], ["1", "ballot per voter, on-chain"], ["0", "parties you must trust"]].map(([n, l]) => (
              <div key={l} className="border-l-2 border-edge pl-3.5">
                <div className="stat-v">{n}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mt-1.5 leading-snug">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <p className="label !mb-4">Membership proof</p>
          <MerkleFigure />
          <p className="text-sm text-muted mt-4 border-t border-edge pt-4 leading-relaxed">
            The circuit proves your leaf sits somewhere under this root. It never outputs which leaf.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b border-edge pb-4 mb-8 gap-4">
          <h3 className="font-display font-black text-2xl">The three guarantees</h3>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted hidden sm:inline">construction, not policy</span>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {GUARANTEES.map((g) => (
            <div key={g.p} className="card flex flex-col">
              <h4 className="font-display font-bold text-lg mb-3">{g.t}</h4>
              <p className="text-sm text-muted leading-relaxed flex-1">{g.d}</p>
              <p className="font-mono text-[11px] text-foil mt-5 pt-4 border-t border-edge tracking-wide">{g.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="border-b border-edge pb-4 mb-8">
          <h3 className="font-display font-black text-2xl">How an election runs</h3>
          <p className="text-sm text-muted mt-2">Four phases, in order. A phase cannot be re-entered once passed.</p>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-edge border border-edge rounded-[3px] overflow-hidden">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="bg-panel p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="font-mono text-[11px] text-foil">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1 h-px bg-edge" />
              </div>
              <h4 className="font-display font-bold text-base mb-2">{t}</h4>
              <p className="text-[13px] text-muted leading-relaxed">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <p className="label !mb-4">What this build does not claim</p>
        <div className="grid md:grid-cols-2 gap-x-10">
          {LIMITS.map(([k, v]) => (
            <div key={k} className="kv py-2 border-b border-edge/60">
              <span className="kv-k">{k}</span><span className="kv-leader" /><span className="kv-v !font-normal">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted mt-5 pt-5 border-t border-edge max-w-3xl leading-relaxed">
          A production deployment would need a multi-party ceremony, so that no single
          person ever holds the toxic waste that would let them forge a proof. This build
          demonstrates the protocol end to end; it is not hardened for a binding election.
        </p>
      </section>

      <section className="card">
        <div className="md:flex items-start justify-between gap-8">
          <div className="max-w-xl">
            <h4 className="font-display font-bold text-lg mb-2">Run it for your institution</h4>
            <p className="text-sm text-muted leading-relaxed">
              The platform operator can delegate a single election to your agency&apos;s wallet —
              you monitor it and publish its results; authority never extends further. Results
              are refused before the polls close and timestamped on-chain the moment they
              appear, so nobody can claim an early or altered count.
            </p>
          </div>
          <button className="btn-ghost mt-5 md:mt-1 shrink-0" onClick={() => onNavigate("admin")}>Open the admin desk</button>
        </div>
      </section>
    </div>
  );
}
