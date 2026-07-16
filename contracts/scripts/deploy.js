const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy the Groth16 verifier (mock for now — see Groth16Verifier.sol TODO)
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddress);

  // 2. Deploy the VotingPlatform pointing at the verifier
  const Platform = await hre.ethers.getContractFactory("VotingPlatform");
  const platform = await Platform.deploy(verifierAddress);
  await platform.waitForDeployment();
  const platformAddress = await platform.getAddress();
  console.log("VotingPlatform deployed to:", platformAddress);

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
