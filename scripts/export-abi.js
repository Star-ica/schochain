// Usage: npx hardhat compile && node scripts/export-abi.js
const fs = require("fs");
const path = require("path");
const names = ["ProviderRegistry", "ApplicationRegistry", "ScholarshipFactory", "ScholarshipProgram"];
const out = {};
for (const n of names) {
  const p = path.join(__dirname, `../artifacts/contracts/${n}.sol/${n}.json`);
  out[n] = JSON.parse(fs.readFileSync(p, "utf8")).abi;
}
out.MockUSDT = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/mocks/MockUSDT.sol/MockUSDT.json"), "utf8")).abi;
fs.writeFileSync(path.join(__dirname, "../frontend/js/abi.js"), "window.SCHO_ABI = " + JSON.stringify(out) + ";\n");
console.log("Wrote frontend/js/abi.js");
