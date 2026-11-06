// Testnet helper: MINT_TO=0x... AMOUNT=1000 npx hardhat run scripts/mint-usdt.js --network botTestnet
const hre = require("hardhat");
const cfg = require("../deployments/" + hre.network.name + ".json");
(async () => {
  if (!cfg.usdtIsMock) throw new Error("USDT is not the mock token.");
  const [s] = await hre.ethers.getSigners();
  const t = await hre.ethers.getContractAt("MockUSDT", cfg.addresses.usdt, s);
  const to = process.env.MINT_TO || s.address;
  await (await t.mint(to, BigInt(process.env.AMOUNT || 1000) * 10n ** 6n)).wait();
  console.log("Minted to", to);
})();
