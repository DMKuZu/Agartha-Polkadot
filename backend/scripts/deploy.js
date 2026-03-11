const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const networkName = hre.network.name;
  const symbol = networkName === "polkadotTestnet" ? "PAS" : "ETH";
  console.log("Balance:", hre.ethers.formatEther(balance), symbol + "\n");

  // Deploy LegalFactory
  const LegalFactory = await hre.ethers.getContractFactory("LegalFactory");
  const factory = await LegalFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("LegalFactory deployed to:", factoryAddress);

  // Deploy CPRALedger
  const CPRALedger = await hre.ethers.getContractFactory("CPRALedger");
  const ledger = await CPRALedger.deploy();
  await ledger.waitForDeployment();
  const ledgerAddress = await ledger.getAddress();
  console.log("CPRALedger deployed to:", ledgerAddress);

  // Write .env.local to the frontend
  const envPath = path.join(__dirname, "../../legal-escrow-dapp/.env.local");
  fs.writeFileSync(
    envPath,
    `NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}\nNEXT_PUBLIC_LEDGER_ADDRESS=${ledgerAddress}\n`
  );

  console.log("\n.env.local written:");
  console.log("  NEXT_PUBLIC_FACTORY_ADDRESS=" + factoryAddress);
  console.log("  NEXT_PUBLIC_LEDGER_ADDRESS=" + ledgerAddress);

  console.log("\n--- Law firm admin (deployer = account[0]) ---");
  console.log("Address:", deployer.address);
  console.log("This is the wallet that must connect to record CPRA ledger entries.");

  console.log("\n--- MetaMask network ---");
  if (networkName === "polkadotTestnet") {
    console.log("RPC URL: https://eth-rpc-testnet.polkadot.io/  |  Chain ID: 420420417  |  Symbol: PAS");
    console.log("Explorer: https://blockscout-testnet.polkadot.io");
  } else {
    console.log("RPC URL: http://127.0.0.1:8545  |  Chain ID: 31337  |  Symbol: ETH");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
