import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import VotePage from "./pages/VotePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import VerifierPage from "./pages/VerifierPage.jsx";
import Landing from "./pages/Landing.jsx";

const TABS = [
  { id: "voter", label: "Voter", blurb: "Cast one ballot. The chain records that you voted, never what you chose." },
  { id: "admin", label: "Admin", blurb: "Open an election, close it, publish a tally anyone can recompute." },
  { id: "verifier", label: "Verifier", blurb: "Recheck any published result from public data. Take nothing on trust." },
];

const NETWORKS = { 31337: "Hardhat · local", 80002: "Polygon Amoy", 137: "Polygon" };

/** The mark: a three-node authentication path. One branch lit, one dark —
 *  one leaf proven, its sibling never revealed. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" className="shrink-0" aria-hidden="true">
      <g stroke="#17405F" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M32 15v7M32 22l14 14M46 36v8" />
      </g>
      <g stroke="#FFC943" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M32 22 18 36M18 36v8" />
      </g>
      <circle cx="32" cy="11" r="4.5" fill="#FFC943" />
      <circle cx="18" cy="48" r="4.5" fill="#FFC943" />
      <circle cx="46" cy="48" r="4.5" fill="#17405F" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState("home");
  const active = TABS.find((t) => t.id === tab);
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const network = NETWORKS[chainId] || (chainId ? `Chain ${chainId}` : "not connected");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-edge bg-ink/92 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between gap-4 h-16">
            <button className="flex items-center gap-3 text-left group" onClick={() => setTab("home")} aria-label="Chorus home">
              <Mark />
              <span className="font-display font-bold text-[15px] uppercase tracking-[0.06em] group-hover:text-foil transition-colors">
                Chorus
              </span>
            </button>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline-flex items-center gap-2 border border-edge rounded-[2px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: isConnected ? "#FFC943" : "#17405F" }} />
                {network}
              </span>
              <ConnectButton showBalance={false} chainStatus="none" />
            </div>
          </div>
          <nav className="flex -mb-px" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] border-b-2 transition-colors ${
                  tab === t.id ? "border-foil text-foil" : "border-transparent text-muted hover:text-ballot"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 w-full flex-1">
        <div key={tab} className="animate-fade-up">
          {tab === "home" ? (
            <Landing onNavigate={setTab} />
          ) : (
            <>
              <div className="mb-8 pb-5 border-b border-edge">
                <h1 className="font-display font-black text-3xl mb-2">{active?.label}</h1>
                <p className="text-muted text-sm max-w-2xl">{active?.blurb}</p>
              </div>
              {tab === "voter" && <VotePage />}
              {tab === "admin" && <AdminPage />}
              {tab === "verifier" && <VerifierPage />}
            </>
          )}
        </div>
      </main>

      {/* Title block, borrowed from the corner of an engineering drawing. */}
      <footer className="border-t border-edge bg-panel/50">
        <div className="max-w-6xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          {[
            ["Project", "Chorus"],
            ["Proof system", "Groth16 · Circom"],
            ["Ballot encryption", "ElGamal · BabyJubJub"],
            ["Network", network],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{k}</div>
              <div className="font-mono text-[12px] mt-1">{v}</div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
