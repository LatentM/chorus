/**
 * Landing — "Notice of Election"
 * The opening view for first-time visitors: states what TrustVote is, why it
 * can be trusted, and routes to the three tools. Real elections begin with a
 * posted public notice; this page is that document.
 */
export default function Landing({ onNavigate }) {
  return (
    <div className="space-y-16 pb-8">
      {/* ——— The Notice ——— */}
      <section className="card !p-0 overflow-hidden">
        <div className="px-8 md:px-12 py-10 md:py-14 relative">
          <p className="font-mono text-[11px] tracking-[0.3em] text-foil uppercase mb-6">
            Notice of Election · Form TV-1
          </p>
          <h2 className="font-display font-black leading-[1.05] tracking-tight text-4xl md:text-6xl max-w-3xl">
            Every ballot secret.
            <br />
            Every result <span className="text-seal">proven.</span>
          </h2>
          <div className="border-t border-edge my-7 max-w-3xl" />
          <p className="text-muted max-w-2xl leading-relaxed">
            TrustVote runs elections where no one — not even the operator — can
            see a vote or fake a count. Who may vote, that they vote once, and
            that the tally is honest are all certified by zero-knowledge
            proofs, checked by the blockchain, and re-checkable by anyone.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button className="btn-seal" onClick={() => onNavigate("voter")}>
              Cast a ballot
            </button>
            <button className="btn-verify" onClick={() => onNavigate("verifier")}>
              Audit an election
            </button>
            <button className="btn-ghost" onClick={() => onNavigate("admin")}>
              Run elections
            </button>
          </div>
        </div>
      </section>

      {/* ——— The three guarantees ——— */}
      <section>
        <p className="label mb-4">The three guarantees</p>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="card">
            <h3 className="font-display font-bold text-lg mb-2">
              Ballots stay sealed
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              Your choice is encrypted in your own browser before anything
              leaves it. The chain stores only ciphertext — there is nothing
              readable to leak, subpoena, or sell.
            </p>
            <p className="font-mono text-[11px] text-foil mt-4 tracking-wide">
              ElGamal · BabyJubJub
            </p>
          </div>
          <div className="card">
            <h3 className="font-display font-bold text-lg mb-2">
              One person, one vote
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              Each ballot carries a nullifier — a one-way serial derived from
              your secret. A second ballot repeats the serial and the contract
              refuses it, without ever learning who you are.
            </p>
            <p className="font-mono text-[11px] text-foil mt-4 tracking-wide">
              Poseidon nullifiers
            </p>
          </div>
          <div className="card">
            <h3 className="font-display font-bold text-lg mb-2">
              Anyone can check the count
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              Every ballot is accepted only with a validity proof, and the
              published tally ships with decryption proofs. The Verifier
              recounts everything from public data alone — no permission
              needed.
            </p>
            <p className="font-mono text-[11px] text-foil mt-4 tracking-wide">
              Groth16 · Chaum-Pedersen
            </p>
          </div>
        </div>
      </section>

      {/* ——— How an election runs ——— */}
      <section>
        <p className="label mb-4">How an election runs</p>
        <div className="card !p-0 divide-y divide-edge">
          {[
            {
              n: "1",
              t: "Register",
              d: "Sign one message. Your wallet derives an anonymous commitment that joins the voter roll — your address never does.",
            },
            {
              n: "2",
              t: "Vote",
              d: "Pick a candidate. Your browser encrypts the choice and builds a zero-knowledge proof; the contract verifies it before accepting.",
            },
            {
              n: "3",
              t: "Tally",
              d: "After close — and only after close — the encrypted ballots are decrypted, each with a proof the decryption was honest.",
            },
            {
              n: "4",
              t: "Audit",
              d: "Anyone opens the Verifier, recounts from the chain and IPFS, and gets a verdict: VERIFIED, or not.",
            },
          ].map((s) => (
            <div key={s.n} className="flex gap-5 px-6 md:px-8 py-5 items-baseline">
              <span className="font-display font-black text-2xl text-seal tabular-nums shrink-0">
                {s.n}
              </span>
              <div>
                <h3 className="font-display font-bold">{s.t}</h3>
                <p className="text-sm text-muted leading-relaxed mt-1">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ——— For institutions ——— */}
      <section className="card">
        <div className="md:flex items-start justify-between gap-8">
          <div className="max-w-xl">
            <h3 className="font-display font-bold text-lg mb-2">
              Run it for your institution
            </h3>
            <p className="text-sm text-muted leading-relaxed">
              The platform operator can delegate a single election to your
              agency's wallet — you monitor it and publish its results;
              authority never extends further. Results are refused before the
              polls close and timestamped on-chain the moment they appear, so
              nobody can claim an early or altered count.
            </p>
          </div>
          <button
            className="btn-ghost mt-5 md:mt-1 shrink-0"
            onClick={() => onNavigate("admin")}
          >
            Open the admin desk
          </button>
        </div>
      </section>
    </div>
  );
}
