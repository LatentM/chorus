// Deployed VotingPlatform address on Polygon Amoy.
// Set VITE_PLATFORM_ADDRESS in frontend/.env after running
//   contracts: npm run deploy:amoy
export const PLATFORM_ADDRESS =
  import.meta.env.VITE_PLATFORM_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

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
      { name: "input", type: "uint256[7]" },
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
