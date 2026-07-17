const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VotingPlatform", () => {
  let platform, verifier, owner, voter;
  const ELECTION_ID = 1n;
  const ROOT = ethers.zeroPadValue("0x1234", 32);

  const mockProof = {
    a: [0n, 0n],
    b: [
      [0n, 0n],
      [0n, 0n],
    ],
    c: [0n, 0n],
  };
  const ciphertext = [1n, 2n, 3n, 4n];
  const NULLIFIER = 777n;

  // Election ElGamal public key used across tests (pinned on-chain and
  // checked against input[7]/input[8] by castVote).
  const PUBKEY = [11n, 22n];

  const input = (root, id, nullifier, pubkey = PUBKEY) => [
    BigInt(root),
    id,
    nullifier,
    ciphertext[0],
    ciphertext[1],
    ciphertext[2],
    ciphertext[3],
    pubkey[0],
    pubkey[1],
  ];

  beforeEach(async () => {
    [owner, voter] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    verifier = await Verifier.deploy();
    const Platform = await ethers.getContractFactory("VotingPlatform");
    platform = await Platform.deploy(await verifier.getAddress());
  });

  async function createOpenElection() {
    const now = await time.latest();
    await platform.createElection(ELECTION_ID, ROOT, now - 10, now + 3600, 11n, 22n);
  }

  it("only owner can create elections", async () => {
    const now = await time.latest();
    await expect(
      platform
        .connect(voter)
        .createElection(ELECTION_ID, ROOT, now, now + 100, 1n, 2n)
    ).to.be.revertedWithCustomError(platform, "OwnableUnauthorizedAccount");
  });

  it("creates an election and emits ElectionCreated", async () => {
    const now = await time.latest();
    await expect(
      platform.createElection(ELECTION_ID, ROOT, now, now + 100, 1n, 2n)
    ).to.emit(platform, "ElectionCreated");
    const e = await platform.getElection(ELECTION_ID);
    expect(e.exists).to.equal(true);
    expect(e.merkleRoot).to.equal(ROOT);
  });

  it("rejects duplicate election ids", async () => {
    await createOpenElection();
    await expect(
      platform.createElection(ELECTION_ID, ROOT, 0, 1, 1n, 2n)
    ).to.be.revertedWith("Election exists");
  });

  it("accepts a valid vote and emits VoteCast", async () => {
    await createOpenElection();
    await expect(
      platform
        .connect(voter)
        .castVote(
          ELECTION_ID,
          NULLIFIER,
          ciphertext,
          mockProof.a,
          mockProof.b,
          mockProof.c,
          input(ROOT, ELECTION_ID, NULLIFIER)
        )
    )
      .to.emit(platform, "VoteCast")
      .withArgs(ELECTION_ID, NULLIFIER, ciphertext);
    expect(await platform.nullifiers(ELECTION_ID, NULLIFIER)).to.equal(true);
  });

  it("rejects double voting (same nullifier)", async () => {
    await createOpenElection();
    const args = [
      ELECTION_ID,
      NULLIFIER,
      ciphertext,
      mockProof.a,
      mockProof.b,
      mockProof.c,
      input(ROOT, ELECTION_ID, NULLIFIER),
    ];
    await platform.connect(voter).castVote(...args);
    await expect(platform.connect(voter).castVote(...args)).to.be.revertedWith(
      "Already voted"
    );
  });

  it("rejects votes outside the window", async () => {
    const now = await time.latest();
    await platform.createElection(ELECTION_ID, ROOT, now + 1000, now + 2000, 1n, 2n);
    await expect(
      platform
        .connect(voter)
        .castVote(
          ELECTION_ID,
          NULLIFIER,
          ciphertext,
          mockProof.a,
          mockProof.b,
          mockProof.c,
          input(ROOT, ELECTION_ID, NULLIFIER)
        )
    ).to.be.revertedWith("Not open");
  });

  it("rejects root / electionId mismatches in public signals", async () => {
    await createOpenElection();
    await expect(
      platform
        .connect(voter)
        .castVote(
          ELECTION_ID,
          NULLIFIER,
          ciphertext,
          mockProof.a,
          mockProof.b,
          mockProof.c,
          input(ethers.ZeroHash, ELECTION_ID, NULLIFIER)
        )
    ).to.be.revertedWith("Root mismatch");

    await expect(
      platform
        .connect(voter)
        .castVote(
          ELECTION_ID,
          NULLIFIER,
          ciphertext,
          mockProof.a,
          mockProof.b,
          mockProof.c,
          input(ROOT, 999n, NULLIFIER)
        )
    ).to.be.revertedWith("ID mismatch");
  });

  it("owner publishes result CID", async () => {
    await createOpenElection();
    await expect(platform.setResultCID(ELECTION_ID, "QmMockResultCID"))
      .to.emit(platform, "ResultPublished")
      .withArgs(ELECTION_ID, "QmMockResultCID");
    const e = await platform.getElection(ELECTION_ID);
    expect(e.resultCID).to.equal("QmMockResultCID");
  });

  it("rejects a proof bound to the wrong election public key", async () => {
    await createOpenElection();
    await expect(
      platform
        .connect(voter)
        .castVote(
          ELECTION_ID,
          NULLIFIER,
          ciphertext,
          mockProof.a,
          mockProof.b,
          mockProof.c,
          input(ROOT, ELECTION_ID, NULLIFIER, [99n, 98n])
        )
    ).to.be.revertedWith("Pubkey mismatch");
  });
});
