const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy the Groth16 verifier (mock for now — see Groth16Verifier.sol TODO)
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  const vRcpt = await verifier.deploymentTransaction().wait();
  console.log("Groth16Verifier deployed to:", verifierAddress, `· gas ${vRcpt.gasUsed}`);

  // ---- Safety: never ship the mock verifier to a public network ----------
  // The mock accepts every proof, so a public deployment with it would accept
  // forged ballots. Detect it via a marker function only the mock exposes.
  const { chainId } = await hre.ethers.provider.getNetwork();
  const LOCAL_CHAINS = [31337n, 1337n];
  let isMock = false;
  try {
    isMock = await hre.ethers
      .getContractAt(["function IS_MOCK_VERIFIER() view returns (bool)"], verifierAddress)
      .then((c) => c.IS_MOCK_VERIFIER());
  } catch {
    isMock = false; // real verifier has no marker
  }
  if (isMock) {
    console.warn("\n⚠  Groth16Verifier is the MOCK — it accepts every proof.");
    if (!LOCAL_CHAINS.includes(chainId) && process.env.ALLOW_MOCK_VERIFIER !== "1") {
      throw new Error(
        `Refusing to deploy the mock verifier to chain ${chainId}. ` +
        "Replace contracts/Groth16Verifier.sol with the ceremony output " +
        "(snarkjs zkey export solidityverifier), or set ALLOW_MOCK_VERIFIER=1 " +
        "for a throwaway testnet deployment."
      );
    }
  }

  // 2. Deploy the VotingPlatform pointing at the verifier
  const Platform = await hre.ethers.getContractFactory("VotingPlatform");
  const platform = await Platform.deploy(verifierAddress);
  await platform.waitForDeployment();
  const platformAddress = await platform.getAddress();
  const pRcpt = await platform.deploymentTransaction().wait();
  console.log("VotingPlatform deployed to:", platformAddress, `· gas ${pRcpt.gasUsed}`);
  console.log(`Total deployment gas: ${vRcpt.gasUsed + pRcpt.gasUsed}`);

  console.log("\nNext steps:");
  console.log("  1. Put these addresses in frontend/.env (VITE_PLATFORM_ADDRESS)");
  console.log("  2. (Optional) Verify on the block explorer:");
  console.log(
    `     npx hardhat verify --network ${hre.network.name} ${verifierAddress}`
  );
  console.log(
    `     npx hardhat verify --network ${hre.network.name} ${platformAddress} ${verifierAddress}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
