// Groth16 proving Web Worker (spec Section 8.2).
// Receives { input, wasm, zkey } and posts:
//   { type: "progress", message }
//   { type: "result", proof, publicSignals }
//   { type: "error", message }
import { groth16 } from "snarkjs";

self.onmessage = async (e) => {
  const { input, wasm, zkey } = e.data;
  try {
    self.postMessage({ type: "progress", message: "Loading circuit WASM…" });

    // snarkjs logs internal progress; forward it as coarse updates
    const logger = {
      debug: () => {},
      info: (m) => self.postMessage({ type: "progress", message: String(m) }),
      warn: () => {},
      error: (m) => self.postMessage({ type: "progress", message: String(m) }),
    };

    self.postMessage({ type: "progress", message: "Computing witness…" });
    // Timed for the evaluation section: witness + proof (snarkjs fullProve).
    const t0 = performance.now();
    const { proof, publicSignals } = await groth16.fullProve(
      input,
      wasm,
      zkey,
      logger
    );
    const proveMs = Math.round(performance.now() - t0);
    self.postMessage({ type: "progress", message: `Proof generated ✓ (${(proveMs / 1000).toFixed(2)} s)` });
    self.postMessage({ type: "result", proof, publicSignals, proveMs });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
