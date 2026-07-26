import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import VotePage from "./pages/VotePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import VerifierPage from "./pages/VerifierPage.jsx";
import Landing from "./pages/Landing.jsx";

const TABS = [
  { id: "voter", label: "Voter", blurb: "Cast an anonymous, provable ballot." },
  { id: "admin", label: "Admin", blurb: "Create elections & publish tallies." },
  { id: "verifier", label: "Verifier", blurb: "Audit any election. Trust no one." },
];

/** The official seal — ring text rotates slowly; the ballot box holds still. */
function SealMark() {
  return (
    <div className="relative w-14 h-14 shrink-0" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full animate-spin-slow text-foil"
      >
        <defs>
          <path
            id="seal-arc"
            d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"
          />
        </defs>
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <text
          fill="currentColor"
          fontSize="11.5"
          fontFamily="'IBM Plex Mono', monospace"
          letterSpacing="3.5"
        >
          <textPath href="#seal-arc">SEALED · SECRET · PROVEN ·</textPath>
        </text>
      </svg>
      {/* ballot into slot glyph, static at the center */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full text-foil">
        <rect x="36" y="46" width="28" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M42 46 L50 35 L58 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("home");
  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur-md shadow-[0_8px_24px_-16px_rgba(0,0,0,0.9)]">
        <div className="max-w-5xl mx-auto px-6 pt-5 pb-0">
          <div className="flex items-center justify-between gap-4">
            <button
              className="flex items-center gap-4 text-left"
              onClick={() => setTab("home")}
              aria-label="TrustVote home"
            >
              <SealMark />
              <div>
                <h1 className="font-display font-black text-[2rem] leading-none tracking-tight">
                  Trust<span className="text-seal">Vote</span>
                </h1>
                <p className="text-muted text-[11px] mt-1.5 font-mono tracking-[0.14em] uppercase">
                  Zero-knowledge voting · Groth16 · Poseidon · ElGamal
                </p>
              </div>
            </button>
            <ConnectButton showBalance={false} />
          </div>

          <nav className="flex gap-1 mt-5" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`px-5 py-2.5 text-sm font-semibold tracking-wide rounded-t-[6px] border border-b-0 transition-colors ${
                  tab === t.id
                    ? "bg-ink border-edge text-ballot -mb-px"
                    : "bg-transparent border-transparent text-muted hover:text-ballot"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 w-full flex-1">
        <div key={tab} className="animate-fade-up">
          {tab === "home" ? (
            <Landing onNavigate={setTab} />
          ) : (
            <>
              <p className="font-display italic text-muted mb-6">
                {active?.blurb}
              </p>
              {tab === "voter" && <VotePage />}
              {tab === "admin" && <AdminPage />}
              {tab === "verifier" && <VerifierPage />}
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-edge">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] font-mono tracking-wide text-muted">
          <span className="border border-edge rounded-[3px] px-2 py-1">BALLOT SECRECY</span>
          <span className="border border-edge rounded-[3px] px-2 py-1">ONE PERSON · ONE VOTE</span>
          <span className="border border-edge rounded-[3px] px-2 py-1">END-TO-END VERIFIABLE</span>
        </div>
      </footer>
    </div>
  );
}
