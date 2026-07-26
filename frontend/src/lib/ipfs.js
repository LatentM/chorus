const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

// Browser-side IPFS via Pinata, with an offline MOCK mode (no API key):
// mock uploads are kept in localStorage so the Admin → Voter → Verifier
// flow works end-to-end on one machine without any Pinata account.
import { keccak256, toUtf8Bytes } from "ethers";

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";
const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
];

const MOCK_PREFIX = "QmMOCK";
const mockKey = (cid) => `trustvote-ipfs-${cid}`;

export function isMockCid(cid) {
  return cid.startsWith(MOCK_PREFIX);
}

/** Upload JSON; returns a CID (real via Pinata, or deterministic mock). */
export async function uploadJSON(json, name = "trustvote.json") {
  if (BACKEND_URL) {
    const r = await fetch(`${BACKEND_URL}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: json, name }),
    });
    if (!r.ok) throw new Error(`Backend pin failed: ${r.status}`);
    return (await r.json()).cid;
  }

  if (!PINATA_JWT) {
    const digest = keccak256(toUtf8Bytes(JSON.stringify(json))).slice(2, 42);
    const cid = `${MOCK_PREFIX}${digest}`;
    localStorage.setItem(mockKey(cid), JSON.stringify(json));
    console.warn(`[ipfs] mock mode — stored ${name} locally as ${cid}`);
    return cid;
  }
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({ pinataMetadata: { name }, pinataContent: json }),
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${await res.text()}`);
  return (await res.json()).IpfsHash;
}

/** Fetch JSON by CID (mock CIDs come from localStorage). */
export async function fetchJSON(cid) {
  if (BACKEND_URL) {
    try {
      const r = await fetch(`${BACKEND_URL}/ipfs/${cid}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return await r.json();
    } catch { /* fall through to direct gateways */ }
  }

  if (isMockCid(cid)) {
    const raw = localStorage.getItem(mockKey(cid));
    if (!raw)
      throw new Error(
        `Mock CID ${cid} not found in this browser — mock IPFS only works on the machine that created the election.`
      );
    return JSON.parse(raw);
  }
  let lastErr;
  for (const gw of GATEWAYS) {
    try {
      const res = await fetch(`${gw}${cid}`);
      if (res.ok) return await res.json();
      lastErr = new Error(`${gw}${cid} → HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`IPFS fetch failed for ${cid}`);
}

// -- Local election index -----------------------------------------------
// The contract stores no list of election ids, so the Admin wizard keeps a
// small local registry { id, title, metadataCid } for the pickers.
const REGISTRY_KEY = "trustvote-elections";

export function registerElection(entry) {
  const list = listElections().filter((e) => e.id !== entry.id);
  list.push(entry);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
}

export function listElections() {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]");
  } catch {
    return [];
  }
}
