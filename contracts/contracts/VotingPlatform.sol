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
        uint256 resultPublishedAt; // block.timestamp of the publication (0 = unpublished)
        string metadataCid; // IPFS CID of election metadata (title, candidates,
                            // merkle tree CID, pubkey) — stored on-chain so ANY
                            // client can discover an election from its id alone
    }

    mapping(uint256 => Election) public elections;

    /// Per-election delegated manager. The platform owner retains all rights
    /// everywhere; a manager may ONLY publish results for their one election.
    /// address(0) = no manager assigned.
    mapping(uint256 => address) public electionManagers;

    /// nullifiers[electionId][nullifier] => used?  (double-vote prevention)
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;

    IGroth16Verifier public verifier;

    event ElectionCreated(
        uint256 indexed electionId,
        bytes32 merkleRoot,
        uint256 startTime,
        uint256 endTime,
        string metadataCid
    );

    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed nullifier,
        uint256[4] ciphertext // [c1x, c1y, c2x, c2y]
    );

    event ResultPublished(
        uint256 indexed electionId,
        string resultCID,
        uint256 publishedAt,
        address indexed publishedBy
    );

    event ManagerAssigned(
        uint256 indexed electionId,
        address indexed manager
    );

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
    }

    function createElection(
        uint256 electionId,
        bytes32 merkleRoot,
        uint256 startTime,
        uint256 endTime,
        uint256 pubKeyX,
        uint256 pubKeyY,
        string calldata metadataCid
    ) external onlyOwner {
        require(!elections[electionId].exists, "Election exists");
        elections[electionId] = Election(
            merkleRoot,
            startTime,
            endTime,
            pubKeyX,
            pubKeyY,
            true,
            "",
            0,
            metadataCid
        );
        emit ElectionCreated(
            electionId,
            merkleRoot,
            startTime,
            endTime,
            metadataCid
        );
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

    /// @notice Assign (or replace/revoke with address(0)) the manager of ONE
    ///         election. Owner-only: the platform operator stays in control of
    ///         who runs what; the manager's authority never extends beyond
    ///         their own election.
    function setElectionManager(uint256 electionId, address manager)
        external
        onlyOwner
    {
        require(elections[electionId].exists, "Election not found");
        electionManagers[electionId] = manager;
        emit ManagerAssigned(electionId, manager);
    }

    /// Owner everywhere; manager only for their own election.
    modifier onlyElectionAuthority(uint256 electionId) {
        require(
            msg.sender == owner() ||
                msg.sender == electionManagers[electionId],
            "Not election authority"
        );
        _;
    }

    /// @notice Publish the IPFS CID of the tally + Chaum-Pedersen decryption
    ///         proofs. Callable by the owner or the election's manager, and
    ///         ONLY after the voting window has closed — results cannot be
    ///         "published" early to mislead observers. The publication moment
    ///         is recorded on-chain.
    function setResultCID(uint256 electionId, string calldata cid)
        external
        onlyElectionAuthority(electionId)
    {
        Election storage e = elections[electionId];
        require(e.exists, "Election not found");
        require(block.timestamp > e.endTime, "Election not ended");
        e.resultCID = cid;
        e.resultPublishedAt = block.timestamp;
        emit ResultPublished(electionId, cid, block.timestamp, msg.sender);
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
