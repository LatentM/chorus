const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("VotingPlatform", () => {
  let platform, verifier, owner, voter, manager;
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
    [owner, voter, manager] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    verifier = await Verifier.deploy();
    const Platform = await ethers.getContractFactory("VotingPlatform");
    platform = await Platform.deploy(await verifier.getAddress());
  });

  async function createOpenElection() {
    const now = await time.latest();
    await platform.createElection(ELECTION_ID, ROOT, now - 10, now + 3600, 11n, 22n, "QmMeta");
  }

  it("only owner can create elections", async () => {
    const now = await time.latest();
    await expect(
      platform
        .connect(voter)
        .createElection(ELECTION_ID, ROOT, now, now + 100, 1n, 2n, "QmMeta")
    ).to.be.revertedWithCustomError(platform, "OwnableUnauthorizedAccount");
  });

  it("creates an election and emits ElectionCreated", async () => {
    const now = await time.latest();
    await expect(
      platform.createElection(ELECTION_ID, ROOT, now, now + 100, 1n, 2n, "QmMeta")
    ).to.emit(platform, "ElectionCreated");
    const e = await platform.getElection(ELECTION_ID);
    expect(e.exists).to.equal(true);
    expect(e.merkleRoot).to.equal(ROOT);
  });

  it("rejects duplicate election ids", async () => {
    await createOpenElection();
    await expect(
      platform.createElection(ELECTION_ID, ROOT, 0, 1, 1n, 2n, "QmMeta")
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
    await platform.createElection(ELECTION_ID, ROOT, now + 1000, now + 2000, 1n, 2n, "QmMeta");
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

  it("owner publishes result CID after the election ends (timestamped)", async () => {
    await createOpenElection();
    await time.increase(4000); // past endTime
    await expect(platform.setResultCID(ELECTION_ID, "QmMockResultCID"))
      .to.emit(platform, "ResultPublished")
      .withArgs(ELECTION_ID, "QmMockResultCID", anyValue, owner.address);
    const e = await platform.getElection(ELECTION_ID);
    expect(e.resultCID).to.equal("QmMockResultCID");
    expect(e.resultPublishedAt).to.be.gt(0n);
  });

  it("rejects publishing results before the election ends", async () => {
    await createOpenElection();
    await expect(
      platform.setResultCID(ELECTION_ID, "QmEarlyCID")
    ).to.be.revertedWith("Election not ended");
  });

  it("owner can delegate ONE election to a manager who can then publish", async () => {
    await createOpenElection();
    await expect(platform.setElectionManager(ELECTION_ID, manager.address))
      .to.emit(platform, "ManagerAssigned")
      .withArgs(ELECTION_ID, manager.address);
    await time.increase(4000);
    await expect(
      platform.connect(manager).setResultCID(ELECTION_ID, "QmManagerCID")
    )
      .to.emit(platform, "ResultPublished")
      .withArgs(ELECTION_ID, "QmManagerCID", anyValue, manager.address);
  });

  it("a manager's authority does not extend to other elections", async () => {
    await createOpenElection();
    const now = await time.latest();
    await platform.createElection(2n, ROOT, now - 10, now + 3600, 11n, 22n, "QmMeta2");
    await platform.setElectionManager(ELECTION_ID, manager.address);
    await time.increase(4000);
    await expect(
      platform.connect(manager).setResultCID(2n, "QmSneakyCID")
    ).to.be.revertedWith("Not election authority");
  });

  it("random accounts cannot publish results or assign managers", async () => {
    await createOpenElection();
    await time.increase(4000);
    await expect(
      platform.connect(voter).setResultCID(ELECTION_ID, "QmVoterCID")
    ).to.be.revertedWith("Not election authority");
    await expect(
      platform.connect(voter).setElectionManager(ELECTION_ID, voter.address)
    ).to.be.revertedWithCustomError(platform, "OwnableUnauthorizedAccount");
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
