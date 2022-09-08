import { ethers } from "hardhat";

async function main() {
  const Lacat = await ethers.getContractFactory("Lacat");
  const lacat = await Lacat.deploy();

  await lacat.deployed();

  console.log(`Lacat deployed to ${lacat.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
