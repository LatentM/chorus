// Shared Pinata (IPFS) helper — falls back to a deterministic MOCK CID
// when no API key is configured, so the whole flow runs offline.
import crypto from "crypto";
import fs from "fs";

const PINATA_JWT = process.env.PINATA_JWT || "";

/** Deterministic mock CID so re-runs are stable. Also writes the payload
 *  next to the scripts as `.mock-ipfs/<cid>.json` so the frontend / tally
 *  can read it back in mock mode. */
function mockCid(json) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(json))
    .digest("hex")
    .slice(0, 40);
  const cid = `QmMOCK${digest}`;
  fs.mkdirSync(".mock-ipfs", { recursive: true });
  fs.writeFileSync(`.mock-ipfs/${cid}.json`, JSON.stringify(json, null, 2));
  return cid;
}

/**
 * Upload a JSON object to IPFS via Pinata. Returns the CID string.
 * With no PINATA_JWT set, returns a mock CID (offline mode).
 */
export async function uploadJSON(json, name = "chorus.json") {
  if (!PINATA_JWT) {
    const cid = mockCid(json);
    console.log(`[pinata] no PINATA_JWT — using MOCK CID ${cid}`);
    return cid;
  }
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: json,
    }),
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${await res.text()}`);
  const { IpfsHash } = await res.json();
  console.log(`[pinata] pinned ${name} → ${IpfsHash}`);
  return IpfsHash;
}

/** Fetch JSON back (gateway for real CIDs, local file for mock CIDs). */
export async function fetchJSON(cid) {
  if (cid.startsWith("QmMOCK")) {
    return JSON.parse(fs.readFileSync(`.mock-ipfs/${cid}.json`, "utf8"));
  }
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed for ${cid}`);
  return res.json();
}
