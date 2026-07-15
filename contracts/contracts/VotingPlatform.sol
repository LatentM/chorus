// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface to the (snarkjs-generated) Groth16 verifier.
/// input = [merkleRoot, electionId, nullifier, c1x, c1y, c2x, c2y,
///          pubKeyX, pubKeyY]
/// The first 7 signals follow spec Section 6.2; signals 8-9 bind the
/// ElGamal encryption key to the on-chain election record so a prover
/// cannot encrypt under a key of their choosing (spoiled-ballot attack).
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory input
    ) external view returns (bool);
}

/**
 * @title TrustVote VotingPlatform
 * @notice A single admin-owned contract managing multiple anonymous,
 *         ZK-verified elections (spec Section 6.2).
 *
 *  - merkleRoot        : root of the Poseidon Merkle tree of eligible voters
 *  - startTime/endTime : voting window (unix timestamps)
 *  - pubKeyX/pubKeyY   : ElGamal public key (BabyJubJub affine coordinates)
 *  - resultCID         : IPFS CID of the published tally + decryption proofs
 *
 *  Ciphertexts are NOT stored — only emitted via VoteCast events, which is
 *  sufficient for tallying and saves gas (spec design notes).
 */
contract VotingPlatform is Ownable {
    struct Election {
        bytes32 merkleRoot;
        uint256 startTime;
        uint256 endTime;
        uint256 pubKeyX;
        uint256 pubKeyY;
        bool exists;
        string resultCID; // IPFS CID of published results (set after tally)
    }

    mapping(uint256 => Election) public elections;

    /// nullifiers[electionId][nullifier] => used?  (double-vote prevention)
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;

    IGroth16Verifier public verifier;

    event ElectionCreated(
        uint256 indexed electionId,
        bytes32 merkleRoot,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed nullifier,
        uint256[4] ciphertext // [c1x, c1y, c2x, c2y]
    );

    event ResultPublished(uint256 indexed electionId, string resultCID);

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
    }

    function createElection(
        uint256 electionId,
        bytes32 merkleRoot,
        uint256 startTime,
        uint256 endTime,
        uint256 pubKeyX,
        uint256 pubKeyY
    ) external onlyOwner {
        require(!elections[electionId].exists, "Election exists");
        elections[electionId] = Election(
            merkleRoot,
            startTime,
            endTime,
            pubKeyX,
            pubKeyY,
            true,
            ""
        );
        emit ElectionCreated(electionId, merkleRoot, startTime, endTime);
    }

    function castVote(
        uint256 electionId,
        uint256 nullifier,
        uint256[4] calldata ciphertext, // [c1x, c1y, c2x, c2y]
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[9] calldata input // [root, electionId, nullifier,
                                  //  c1x, c1y, c2x, c2y, pubKeyX, pubKeyY]
    ) external {
        Election storage e = elections[electionId];
        require(e.exists, "Election not found");
        require(
            block.timestamp >= e.startTime && block.timestamp <= e.endTime,
            "Not open"
        );
        require(!nullifiers[electionId][nullifier], "Already voted");
        require(input[0] == uint256(e.merkleRoot), "Root mismatch");
        require(input[1] == electionId, "ID mismatch");
        require(input[2] == nullifier, "Nullifier mismatch");
        require(
            input[7] == e.pubKeyX && input[8] == e.pubKeyY,
            "Pubkey mismatch"
        );
        require(verifier.verifyProof(a, b, c, input), "Invalid proof");

        nullifiers[electionId][nullifier] = true;
        emit VoteCast(electionId, nullifier, ciphertext);
    }

    /// @notice Publish the IPFS CID of the tally + Chaum-Pedersen decryption proofs.
    function setResultCID(uint256 electionId, string calldata cid)
        external
        onlyOwner
    {
        require(elections[electionId].exists, "Election not found");
        elections[electionId].resultCID = cid;
        emit ResultPublished(electionId, cid);
    }

    /// @notice Convenience getter that returns the whole struct (incl. resultCID).
    function getElection(uint256 electionId)
        external
        view
        returns (Election memory)
    {
        return elections[electionId];
    }
}
