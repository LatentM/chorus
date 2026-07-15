pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/escalarmulany.circom";

/*
 * MultiMerkleProof(nLevels)
 * -------------------------
 * Recomputes a Poseidon Merkle root from a leaf, its siblings, and
 * left/right path indices. The tree is a FIXED-DEPTH (nLevels) tree padded
 * with the zero-hash cascade zeros[0]=0, zeros[i+1]=Poseidon(zeros[i],zeros[i])
 * (see scripts/generateMerkleTree.js and frontend/src/lib/crypto.js).
 *
 * At each level, with p = pathIndices[i] (0 => computed node is LEFT,
 * 1 => computed node is RIGHT), the parent is:
 *
 *   parent = Poseidon( computed*(1-p) + sibling*p ,
 *                      sibling*(1-p)  + computed*p )
 */
template MultiMerkleProof(nLevels) {
    signal input leaf;
    signal input siblings[nLevels];
    signal input pathIndices[nLevels];
    signal output root;

    component hashers[nLevels];
    signal computed[nLevels + 1];
    signal leftSel[nLevels];
    signal rightSel[nLevels];

    computed[0] <== leaf;

    for (var i = 0; i < nLevels; i++) {
        // Constrain pathIndices to be binary: p * (p - 1) === 0
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // left  = computed*(1-p) + sibling*p
        // right = sibling*(1-p)  + computed*p
        leftSel[i]  <== computed[i] + pathIndices[i] * (siblings[i] - computed[i]);
        rightSel[i] <== siblings[i] + pathIndices[i] * (computed[i] - siblings[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== leftSel[i];
        hashers[i].inputs[1] <== rightSel[i];

        computed[i + 1] <== hashers[i].out;
    }

    root <== computed[nLevels];
}

/*
 * ElGamalEncrypt(nBitsVote)
 * -------------------------
 * Exponential ElGamal over BabyJubJub (spec Section 5.2):
 *
 *   C1 = g * r
 *   C2 = h * r + g * vote
 *
 * where g = Base8 (the subgroup generator), h = the election public key,
 * r = encryption randomness, and the "message" g*vote encodes the candidate
 * index in the exponent (decrypted off-chain by discrete-log lookup —
 * scripts/tally.js).
 *
 * - g*r      : EscalarMulFix over the fixed base Base8 (cheap, windowed).
 * - h*r      : EscalarMulAny over the variable point h.
 * - g*vote   : EscalarMulFix over Base8 with only nBitsVote bits.
 * - C2       : BabyAdd(h*r, g*vote). BabyJubJub is a twisted Edwards curve,
 *              so addition is complete — it is correct even when
 *              g*vote = (0,1) (the identity, i.e. vote = 0), matching the
 *              JS-side encoding in frontend/src/lib/crypto.js.
 *
 * The election public key is validated on-curve with BabyCheck, and is bound
 * to the on-chain election record by the contract (castVote checks
 * input[7] == pubKeyX && input[8] == pubKeyY), so a prover cannot encrypt
 * to a key other than the official election key.
 */
template ElGamalEncrypt(nBitsVote) {
    signal input r;                    // encryption randomness (scalar)
    signal input voteBits[nBitsVote];  // bit-decomposition of the vote
                                       // (already constrained binary by the
                                       // caller's Num2Bits — reused here)
    signal input pubKey[2];            // election public key h = (x, y)

    signal output c1[2];               // C1 = g * r
    signal output c2[2];               // C2 = h * r + g * vote

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    // Election public key must be a valid curve point.
    component pkCheck = BabyCheck();
    pkCheck.x <== pubKey[0];
    pkCheck.y <== pubKey[1];

    // r != 0 (a zero r would leak g*vote directly: C2 = g*vote, C1 = identity)
    component rIsZero = IsZero();
    rIsZero.in <== r;
    rIsZero.out === 0;

    // Bit-decompose r (253 bits covers the BabyJubJub subgroup order ~2^251)
    component rBits = Num2Bits(253);
    rBits.in <== r;

    // C1 = g * r  (fixed-base multiplication over Base8)
    component gR = EscalarMulFix(253, BASE8);
    for (var i = 0; i < 253; i++) {
        gR.e[i] <== rBits.out[i];
    }
    c1[0] <== gR.out[0];
    c1[1] <== gR.out[1];

    // h * r  (variable-base multiplication over the election public key)
    component hR = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) {
        hR.e[i] <== rBits.out[i];
    }
    hR.p[0] <== pubKey[0];
    hR.p[1] <== pubKey[1];

    // g * vote  (fixed-base with only nBitsVote bits)
    component gV = EscalarMulFix(nBitsVote, BASE8);
    for (var i = 0; i < nBitsVote; i++) {
        gV.e[i] <== voteBits[i];
    }

    // C2 = h*r + g*vote (complete twisted Edwards addition — correct even
    // when g*vote is the identity (0,1), i.e. vote = 0)
    component add = BabyAdd();
    add.x1 <== hR.out[0];
    add.y1 <== hR.out[1];
    add.x2 <== gV.out[0];
    add.y2 <== gV.out[1];
    c2[0] <== add.xout;
    c2[1] <== add.yout;
}

/*
 * VotingCircuit(nLevels, nCandidates)
 * -----------------------------------
 * Proves (spec Section 3.2 / 7):
 *   "I know a secretKey whose derived BabyJubJub public key hashes to a leaf
 *    (voter commitment) in the Merkle tree with root `root`; my nullifier is
 *    Poseidon(secretKey, electionId); my vote is in [0, nCandidates);
 *    and (c1, c2) is a well-formed exponential-ElGamal encryption of my vote
 *    under the election public key (pubKeyX, pubKeyY)."
 *
 * Public signals (snarkjs orders outputs first, then public inputs):
 *   [root, electionId, nullifier, c1x, c1y, c2x, c2y, pubKeyX, pubKeyY]
 * — exactly the uint[9] consumed by VotingPlatform.castVote. The first 7
 * follow the spec Section 6.2 layout; signals 8–9 bind the encryption key
 * to the on-chain election record (see NOTE at the bottom).
 */
template VotingCircuit(nLevels, nCandidates) {
    // ---- Private inputs ----
    signal input secretKey;              // BabyJubJub scalar (derived from wallet sig)
    signal input siblings[nLevels];      // Merkle proof siblings
    signal input pathIndices[nLevels];   // 0/1 for left/right
    signal input vote;                   // 0..nCandidates-1
    signal input encRandomness;          // scalar r for ElGamal encryption
    signal input electionIdInput;        // election id (mirrored to public output)

    // ---- Public inputs ----
    signal input pubKeyX;                // election ElGamal public key h.x
    signal input pubKeyY;                // election ElGamal public key h.y

    // ---- Public outputs ----
    signal output root;
    signal output electionId;
    signal output nullifier;
    signal output c1x;
    signal output c1y;
    signal output c2x;
    signal output c2y;

    // 1. Derive public key from secret key: pk = Base8 * secretKey
    component pubKeyGen = BabyPbk();
    pubKeyGen.in <== secretKey;

    // 2. Voter commitment (Merkle leaf) = Poseidon(pk.x)
    //    Voters register this commitment during the registration phase;
    //    the admin builds the tree over commitments (spec Section 7).
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== pubKeyGen.Ax;

    // 3. Merkle membership: recompute root from leaf + path
    component merkle = MultiMerkleProof(nLevels);
    merkle.leaf <== leafHasher.out;
    for (var i = 0; i < nLevels; i++) {
        merkle.siblings[i] <== siblings[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    root <== merkle.root;

    // 4. Nullifier = Poseidon(secretKey, electionId)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secretKey;
    nullifierHasher.inputs[1] <== electionIdInput;
    nullifier <== nullifierHasher.out;
    // Mirror the private election id to a public output. The constraint
    // electionId <== electionIdInput makes the public signal binding, so the
    // contract's `input[1] == electionId` check pins the nullifier domain.
    electionId <== electionIdInput;

    // 5. Range check: vote < nCandidates.
    //    Num2Bits(4) first constrains vote to 4 bits (nCandidates <= 10 < 16)
    //    so the LessThan comparison is sound.
    component voteBits = Num2Bits(4);
    voteBits.in <== vote;
    component lt = LessThan(4);
    lt.in[0] <== vote;
    lt.in[1] <== nCandidates;
    lt.out === 1;

    // 6. ElGamal encryption (real, in-circuit):
    //    C1 = g*r ; C2 = h*r + g*vote  over BabyJubJub.
    component enc = ElGamalEncrypt(4);
    enc.r <== encRandomness;
    enc.pubKey[0] <== pubKeyX;
    enc.pubKey[1] <== pubKeyY;
    for (var i = 0; i < 4; i++) {
        enc.voteBits[i] <== voteBits.out[i];
    }
    c1x <== enc.c1[0];
    c1y <== enc.c1[1];
    c2x <== enc.c2[0];
    c2y <== enc.c2[1];
}

/*
 * NOTE on the public-signal layout (deviation from spec Section 6.2 uint[7]):
 *
 * The spec's uint[7] layout does not expose the encryption key, which would
 * let a malicious prover encrypt under a key of their choosing (producing an
 * undecryptable, spoiled ballot that still passes verification). Binding
 * h = (pubKeyX, pubKeyY) as public inputs — checked by the contract against
 * the stored election key — closes that gap. snarkjs public-signal order is
 * [outputs..., public inputs...], giving exactly:
 *
 *   input[0] root       input[3] c1x   input[5] c2x   input[7] pubKeyX
 *   input[1] electionId input[4] c1y   input[6] c2y   input[8] pubKeyY
 *   input[2] nullifier
 *
 * The first 7 entries keep the spec's order, so all spec-mandated contract
 * checks are unchanged; VotingPlatform adds two equality checks for 7 and 8.
 */
component main {public [pubKeyX, pubKeyY]} = VotingCircuit(20, 10);
