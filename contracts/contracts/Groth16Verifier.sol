// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Groth16Verifier (MOCK)
 *
 * TODO: replace this mock with the real verifier generated from the compiled
 *       circuit and the trusted-setup ceremony:
 *
 *       snarkjs zkey export solidityverifier circuit_final.zkey verifier.sol
 *
 * The generated contract exposes the exact same
 * verifyProof(uint[2] a, uint[2][2] b, uint[2] c, uint[9] input) signature
 * (9 public signals: root, electionId, nullifier, c1x, c1y, c2x, c2y,
 * pubKeyX, pubKeyY),
 * so VotingPlatform needs no changes — just deploy the real verifier and
 * pass its address to the VotingPlatform constructor.
 *
 * This mock accepts every proof so the end-to-end flow (admin → voter →
 * verifier) can be exercised on Polygon Amoy before the ceremony is done.
 */
contract Groth16Verifier {
    function verifyProof(
        uint256[2] memory, /* a */
        uint256[2][2] memory, /* b */
        uint256[2] memory, /* c */
        uint256[9] memory /* input */
    ) external pure returns (bool) {
        // MOCK: always accept. See TODO above.
        return true;
    }
}
