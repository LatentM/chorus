// TrustVote browser crypto — Poseidon, BabyJubJub ElGamal, Merkle proofs,
// secret derivation, Chaum-Pedersen verification, AES-GCM key vaults.
// All primitives per spec Section 5.
import { buildPoseidon, buildBabyjub } from "circomlibjs";
import { keccak256, toUtf8Bytes } from "ethers";

let _poseidon = null;
let _babyJub = null;

export async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}
export async function getBabyJub() {
  if (!_babyJub) _babyJub = await buildBabyjub();
  return _babyJub;
}

/** Poseidon over bigints, returns bigint. */
export async function poseidonHash(inputs) {
  const p = await getPoseidon();
  return p.F.toObject(p(inputs));
}

// ---------------------------------------------------------------------------
// Secret derivation (spec 4.2 Step 5)
// ---------------------------------------------------------------------------

export function voteMessage(electionId) {
  return `TrustVote Election: ${electionId}`;
}

/**
 * Derive the circuit secretKey deterministically from a wallet signature of
 * "TrustVote Election: [electionId]": keccak256(signature) reduced mod the
 * BabyJubJub subgroup order. The Ethereum private key never leaves the wallet.
 */
export async function deriveSecretKey(signature) {
  const babyJub = await getBabyJub();
  const h = BigInt(keccak256(toUtf8Bytes(signature)));
  return h % babyJub.subOrder;
}

/** nullifier = Poseidon(secretKey, electionId) */
export async function computeNullifier(secretKey, electionId) {
  return poseidonHash([secretKey, BigInt(electionId)]);
}

// ---------------------------------------------------------------------------
// Voter commitments & fixed-depth Merkle tree
// (identical layout to scripts/generateMerkleTree.js; matches the circuit's
//  MultiMerkleProof(20) exactly, so real Groth16 proofs verify against the
//  on-chain root)
// ---------------------------------------------------------------------------

export const TREE_DEPTH = 20;

/**
 * Voter commitment (the Merkle leaf) = Poseidon(BabyPbk(secretKey).Ax),
 * exactly what the circuit recomputes in-circuit (spec Section 7).
 * Voters derive & submit this during the REGISTRATION phase; the Ethereum
 * address never enters the tree, so on-chain votes cannot be linked back
 * to an address.
 *
 * Returns { commitment, pubAx } as bigints.
 */
export async function deriveVoterCommitment(secretKey) {
  const babyJub = await getBabyJub();
  const pk = babyJub.mulPointEscalar(babyJub.Base8, BigInt(secretKey));
  const pubAx = babyJub.F.toObject(pk[0]);
  const commitment = await poseidonHash([pubAx]);
  return { commitment, pubAx };
}

/**
 * Zero-hash cascade for fixed-depth padding:
 *   zeros[0] = 0, zeros[i+1] = Poseidon(zeros[i], zeros[i]).
 * Level i of the tree pads missing right-siblings with zeros[i].
 */
export async function zeroCascade(depth = TREE_DEPTH) {
  const zeros = [0n];
  for (let i = 0; i < depth; i++) {
    zeros.push(await poseidonHash([zeros[i], zeros[i]]));
  }
  return zeros;
}

/**
 * Build the fixed-depth (TREE_DEPTH) Poseidon Merkle tree over voter
 * commitments. Only non-zero nodes are materialised; zero-region nodes are
 * implied by the cascade. Returns a JSON-serialisable tree:
 *   { depth, root, leaves[], zeros[], levels[][] }
 */
export async function buildCommitmentTree(commitments, depth = TREE_DEPTH) {
  if (commitments.length === 0) throw new Error("No commitments");
  if (commitments.length > 2 ** depth)
    throw new Error(`More than 2^${depth} commitments`);

  const zeros = await zeroCascade(depth);
  const leaves = commitments.map(BigInt);

  const levels = [leaves.slice()];
  let current = leaves.slice();
  for (let level = 0; level < depth; level++) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : zeros[level];
      next.push(await poseidonHash([left, right]));
    }
    levels.push(next);
    current = next;
  }

  return {
    depth,
    root: current[0].toString(),
    leaves: leaves.map(String),
    zeros: zeros.map(String),
    levels: levels.map((lvl) => lvl.map(String)),
  };
}

/**
 * Extract a Merkle proof for `leaf` from a tree produced by
 * buildCommitmentTree / scripts/generateMerkleTree.js.
 * Returns { siblings, pathIndices, root, index } as bigints — exactly
 * `tree.depth` entries, so the witness matches MultiMerkleProof(20).
 */
export function buildMerkleProof(tree, leaf) {
  const leaves = tree.leaves.map(BigInt);
  const index = leaves.findIndex((l) => l === BigInt(leaf));
  if (index === -1) return null;

  const levels = tree.levels.map((lvl) => lvl.map(BigInt));
  const zeros = tree.zeros.map(BigInt);

  const siblings = [];
  const pathIndices = [];
  let idx = index;
  for (let level = 0; level < tree.depth; level++) {
    const nodes = levels[level];
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    siblings.push(sibIdx < nodes.length ? nodes[sibIdx] : zeros[level]);
    pathIndices.push(isRight ? 1n : 0n); // 1 => computed node is on the RIGHT
    idx = Math.floor(idx / 2);
  }
  return { siblings, pathIndices, root: BigInt(tree.root), index };
}

// ---------------------------------------------------------------------------
// BabyJubJub ElGamal (spec 4.2 Step 6)
// ---------------------------------------------------------------------------

/** Random scalar < subgroup order via WebCrypto. */
export async function randomScalar() {
  const babyJub = await getBabyJub();
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n % babyJub.subOrder;
}

/** Generate an ElGamal keypair { sk, pkX, pkY } (strings). */
export async function generateElGamalKeypair() {
  const babyJub = await getBabyJub();
  const sk = await randomScalar();
  const pk = babyJub.mulPointEscalar(babyJub.Base8, sk);
  return {
    sk: sk.toString(),
    pkX: babyJub.F.toObject(pk[0]).toString(),
    pkY: babyJub.F.toObject(pk[1]).toString(),
  };
}

/**
 * Exponential ElGamal: c1 = g*r, c2 = h*r + g*vote.
 * Returns { c1x, c1y, c2x, c2y, r } as bigints.
 */
export async function encryptVote(vote, pubKeyX, pubKeyY, r) {
  const babyJub = await getBabyJub();
  const F = babyJub.F;
  const G = babyJub.Base8;
  const h = [F.e(BigInt(pubKeyX)), F.e(BigInt(pubKeyY))];

  const c1 = babyJub.mulPointEscalar(G, r);
  const hr = babyJub.mulPointEscalar(h, r);
  // g * vote — vote 0 encodes as the identity point (0, 1)
  const gv =
    BigInt(vote) === 0n
      ? [F.e(0n), F.e(1n)]
      : babyJub.mulPointEscalar(G, BigInt(vote));
  const c2 = babyJub.addPoint(hr, gv);

  return {
    c1x: F.toObject(c1[0]),
    c1y: F.toObject(c1[1]),
    c2x: F.toObject(c2[0]),
    c2y: F.toObject(c2[1]),
    r,
  };
}

/** Decrypt one ciphertext with sk; returns vote index or null. */
export async function decryptVote(ct, sk, nCandidates) {
  const babyJub = await getBabyJub();
  const F = babyJub.F;
  const G = babyJub.Base8;
  try {
    const C1 = [F.e(BigInt(ct.c1x)), F.e(BigInt(ct.c1y))];
    const C2 = [F.e(BigInt(ct.c2x)), F.e(BigInt(ct.c2y))];
    const shared = babyJub.mulPointEscalar(C1, BigInt(sk));
    const M = babyJub.addPoint(C2, [F.neg(shared[0]), shared[1]]);
    // discrete log lookup over the small candidate range
    let acc = [F.e(0n), F.e(1n)];
    for (let i = 0; i < nCandidates; i++) {
      if (F.eq(acc[0], M[0]) && F.eq(acc[1], M[1]))
        return { vote: i, shared };
      acc = babyJub.addPoint(acc, G);
    }
    return { vote: null, shared };
  } catch {
    return { vote: null, shared: null };
  }
}

// ---------------------------------------------------------------------------
// Chaum-Pedersen DLEQ (spec 4.3 Step 3)
// ---------------------------------------------------------------------------

function fsChallenge(parts) {
  return BigInt(keccak256(toUtf8Bytes(parts.join("|"))));
}

/** Prove log_g(pk) == log_C1(shared) for secret sk. */
export async function chaumPedersenProve(sk, C1, shared, pk, electionId) {
  const babyJub = await getBabyJub();
  const F = babyJub.F;
  const G = babyJub.Base8;
  const order = babyJub.subOrder;
  const co = (P) => [F.toObject(P[0]).toString(), F.toObject(P[1]).toString()];

  const w = await randomScalar();
  const R1 = babyJub.mulPointEscalar(G, w);
  const R2 = babyJub.mulPointEscalar(C1, w);
  const c =
    fsChallenge([
      ...co(R1), ...co(R2), ...co(pk), ...co(C1), ...co(shared),
      electionId.toString(),
    ]) % order;
  const s = (w + BigInt(sk) * c) % order;
  return {
    R1: { x: co(R1)[0], y: co(R1)[1] },
    R2: { x: co(R2)[0], y: co(R2)[1] },
    s: s.toString(),
  };
}

/**
 * Verify a Chaum-Pedersen proof:
 *   g*s == R1 + pk*c   and   C1*s == R2 + shared*c
 * where c = Hash(R1, R2, pk, C1, shared, electionId).
 */
export async function chaumPedersenVerify({
  proof,
  pk,
  C1,
  shared,
  electionId,
}) {
  const babyJub = await getBabyJub();
  const F = babyJub.F;
  const G = babyJub.Base8;
  const order = babyJub.subOrder;
  const P = (o) => [F.e(BigInt(o.x)), F.e(BigInt(o.y))];
  const co = (pt) => [F.toObject(pt[0]).toString(), F.toObject(pt[1]).toString()];
  const eq = (A, B) => F.eq(A[0], B[0]) && F.eq(A[1], B[1]);

  try {
    const R1 = P(proof.R1);
    const R2 = P(proof.R2);
    const pkP = P(pk);
    const C1P = P(C1);
    const sharedP = P(shared);
    const s = BigInt(proof.s);
    const c =
      fsChallenge([
        ...co(R1), ...co(R2), ...co(pkP), ...co(C1P), ...co(sharedP),
        electionId.toString(),
      ]) % order;

    const lhs1 = babyJub.mulPointEscalar(G, s);
    const rhs1 = babyJub.addPoint(R1, babyJub.mulPointEscalar(pkP, c));
    const lhs2 = babyJub.mulPointEscalar(C1P, s);
    const rhs2 = babyJub.addPoint(R2, babyJub.mulPointEscalar(sharedP, c));
    return eq(lhs1, rhs1) && eq(lhs2, rhs2);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// AES-GCM password vault (Admin private key download, spec 8.3)
// ---------------------------------------------------------------------------

async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptWithPassword(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { alg: "AES-GCM+PBKDF2", salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function decryptWithPassword(vault, password) {
  const key = await passwordKey(password, unb64(vault.salt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(vault.iv) },
    key,
    unb64(vault.data)
  );
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function short(x, n = 10) {
  const s = String(x);
  return s.length <= 2 * n ? s : `${s.slice(0, n)}…${s.slice(-6)}`;
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
