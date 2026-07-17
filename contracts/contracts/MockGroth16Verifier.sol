// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockGroth16Verifier — FOR UNIT TESTS ONLY
 *
 * Accepts every proof so VotingPlatform's election-lifecycle logic can be
 * unit-tested with fabricated proofs. The production verifier is
 * Groth16Verifier.sol, generated from the trusted-setup ceremony via
 *
 *   snarkjs zkey export solidityverifier circuit_final.zkey \
 *       ../contracts/contracts/Groth16Verifier.sol
 *
 * NEVER deploy this contract.
 */
contract MockGroth16Verifier {
    function verifyProof(
        uint256[2] memory, /* a */
        uint256[2][2] memory, /* b */
        uint256[2] memory, /* c */
        uint256[9] memory /* input */
    ) external pure returns (bool) {
        return true;
    }
}
