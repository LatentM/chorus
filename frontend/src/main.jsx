import React from "react";
import ReactDOM from "react-dom/client";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { polygonAmoy, sepolia, hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./index.css";

const config = getDefaultConfig({
  appName: "TrustVote",
  projectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "TRUSTVOTE_DEV_PLACEHOLDER",
  // Local Hardhat node first (no faucet needed — see README), then testnets.
  // Whichever network the wallet is on is the one the app talks to.
  chains: [hardhat, sepolia, polygonAmoy],
  ssr: false,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({ accentColor: "#B4552D", borderRadius: "small" })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
