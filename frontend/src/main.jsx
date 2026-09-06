import React from "react";
import ReactDOM from "react-dom/client";
import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { polygon, polygonAmoy, hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./index.css";

const config = getDefaultConfig({
  appName: "Chorus",
  projectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "CHORUS_DEV_PLACEHOLDER",
  // Local Hardhat node first (no faucet needed — see README), then Polygon
  // Amoy (testnet) and Polygon mainnet. The app follows the wallet's network.
  chains: [hardhat, polygonAmoy, polygon],
  ssr: false,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={hardhat.id}
          theme={darkTheme({
            accentColor: "#FFC943",
            accentColorForeground: "#05121F",
            borderRadius: "small",
            overlayBlur: "small",
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
