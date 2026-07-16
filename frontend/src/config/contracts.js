// Deployed VotingPlatform address on Polygon Amoy.
// Set VITE_PLATFORM_ADDRESS in frontend/.env after running
//   contracts: npm run deploy:amoy
const RAW_ADDRESS = (import.meta.env.VITE_PLATFORM_ADDRESS || "").trim();

/**
 * Validate early with an actionable message. Without this, a malformed value
 * surfaces much later as a cryptic viem "Address ... is invalid" at the first
 * write. Common causes: the value was round-tripped through a spreadsheet
 * (Excel rewrites a long hex string as scientific notation, e.g.
 * "5.7788386462362875e+47", irreversibly losing digits), quotes were included,
 * or .env was saved as .env.txt by Notepad.
 */
function validateAddress(value) {
  if (!value) {
    console.warn(
      "[TrustVote] VITE_PLATFORM_ADDRESS is not set in frontend/.env — " +
        "using the zero address. Deploy the contracts, then set it and " +
        "RESTART `npm run dev` (Vite reads .env only at startup)."
    );
    return "0x0000000000000000000000000000000000000000";
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    const hint = /e\+/i.test(value)
      ? " It looks like scientific notation — the address was corrupted by a " +
        "spreadsheet. Copy it straight from the deploy output instead."
      : "";
    throw new Error(
      `[TrustVote] VITE_PLATFORM_ADDRESS in frontend/.env is not a valid ` +
        `address: "${value}". Expected 0x followed by 40 hex characters.${hint}`
    );
  }
  return value;
}

export const PLATFORM_ADDRESS = validateAddress(RAW_ADDRESS);

export const PLATFORM_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_verifier", type: "address" }],
  },
  {
    type: "function",
    name: "createElection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "uint256" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "pubKeyX", type: "uint256" },
      { name: "pubKeyY", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "castVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "ciphertext", type: "uint256[4]" },
      { name: "a", type: "uint256[2]" },
      { name: "b", type: "uint256[2][2]" },
      { name: "c", type: "uint256[2]" },
      { name: "input", type: "uint256[9]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setResultCID",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "uint256" },
      { name: "cid", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getElection",
    stateMutability: "view",
    inputs: [{ name: "electionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "merkleRoot", type: "bytes32" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "pubKeyX", type: "uint256" },
          { name: "pubKeyY", type: "uint256" },
          { name: "exists", type: "bool" },
          { name: "resultCID", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nullifiers",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "ElectionCreated",
    inputs: [
      { name: "electionId", type: "uint256", indexed: true },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "startTime", type: "uint256", indexed: false },
      { name: "endTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "electionId", type: "uint256", indexed: true },
      { name: "nullifier", type: "uint256", indexed: true },
      { name: "ciphertext", type: "uint256[4]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResultPublished",
    inputs: [
      { name: "electionId", type: "uint256", indexed: true },
      { name: "resultCID", type: "string", indexed: false },
    ],
  },
];
