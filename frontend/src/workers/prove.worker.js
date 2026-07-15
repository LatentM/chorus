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
    const { proof, publicSignals } = await groth16.fullProve(
      input,
      wasm,
      zkey,
      logger
    );
    self.postMessage({ type: "progress", message: "Proof generated ✓" });
    self.postMessage({ type: "result", proof, publicSignals });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
