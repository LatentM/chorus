import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import VotePage from "./pages/VotePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import VerifierPage from "./pages/VerifierPage.jsx";

const TABS = [
  { id: "voter", label: "Voter", blurb: "Cast an anonymous, provable ballot" },
  { id: "admin", label: "Admin", blurb: "Create elections & publish tallies" },
  { id: "verifier", label: "Verifier", blurb: "Audit any election, trust no one" },
];

export default function App() {
  const [tab, setTab] = useState("voter");

  return (
    <div className="min-h-screen">
      <header className="border-b border-edge">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              Trust<span className="text-seal">Vote</span>
            </h1>
            <p className="text-muted text-xs mt-0.5 font-mono">
              zero-knowledge voting · Polygon Amoy · Groth16 + Poseidon + ElGamal
            </p>
          </div>
          <ConnectButton showBalance={false} />
        </div>
        <nav className="max-w-5xl mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-seal text-ballot"
                  : "border-transparent text-muted hover:text-ballot"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-muted text-sm mb-6 font-display italic">
          {TABS.find((t) => t.id === tab)?.blurb}
        </p>
        {tab === "voter" && <VotePage />}
        {tab === "admin" && <AdminPage />}
        {tab === "verifier" && <VerifierPage />}
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-muted border-t border-edge">
        Ballot secrecy · one-person-one-vote · end-to-end verifiability. Mock
        Groth16 verifier active until the trusted setup ceremony replaces it —
        see circuits/README.md.
      </footer>
    </div>
  );
}
