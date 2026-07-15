import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // circomlibjs / snarkjs expect some Node globals in the browser
    nodePolyfills({ globals: { Buffer: true, process: true } }),
  ],
  server: { port: 3000 },
  worker: { format: "es" },
  define: { global: "globalThis" },
  optimizeDeps: { esbuildOptions: { target: "es2020" } },
  build: { target: "es2020" },
});
