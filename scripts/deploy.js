// Usage: npx hardhat run scripts/deploy.js --network botTestnet
// Env: PRIVATE_KEY (required), USDT_ADDRESS (optional; testnet deploys MockUSDT when absent)
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying with ${deployer.address} on ${network.name} (chain ${chainId})`);

  const deploy = async (name, ...args) => {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    console.log(`${name.padEnd(20)} ${await c.getAddress()}`);
    return c;
  };

  let usdt = process.env.USDT_ADDRESS || "";
  let usdtIsMock = false;
  if (!usdt) {
    if (chainId === 677) throw new Error("Set USDT_ADDRESS for mainnet; MockUSDT is testnet-only.");
    usdt = await (await deploy("MockUSDT")).getAddress();
    usdtIsMock = true;
  }

  const registry = await deploy("ProviderRegistry");
  const appRegistry = await deploy("ApplicationRegistry");
  const impl = await deploy("ScholarshipProgram");
  const factory = await deploy("ScholarshipFactory", await registry.getAddress(), await appRegistry.getAddress(), await impl.getAddress(), usdt);
  await (await appRegistry.setFactory(await factory.getAddress())).wait();
  console.log("ApplicationRegistry factory link set.");

  const cfg = {
    chainId,
    rpcUrl: network.config.url || "",
    explorer: "https://scan.botchain.ai",
    usdtIsMock,
    addresses: {
      providerRegistry: await registry.getAddress(),
      applicationRegistry: await appRegistry.getAddress(),
      factory: await factory.getAddress(),
      implementation: await impl.getAddress(),
      usdt,
    },
  };
  fs.mkdirSync(path.join(__dirname, "../deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, `../deployments/${network.name}.json`), JSON.stringify(cfg, null, 2));
  fs.writeFileSync(path.join(__dirname, "../frontend/js/deployment.js"), `window.SCHO_DEPLOY = ${JSON.stringify(cfg, null, 2)};\n`);
  console.log("Wrote deployments/" + network.name + ".json and frontend/js/deployment.js");
}

main().catch((e) => { console.error(e); process.exit(1); });
