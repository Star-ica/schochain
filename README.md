# SchoChain — Decentralized Scholarship Management on BOT Chain

Stack: HTML5, CSS3, vanilla JavaScript, Solidity 0.8.24, ethers.js v6 (bundled locally). **No backend, database or centralized storage.**

```
contracts/   ProviderRegistry, ApplicationRegistry, ScholarshipFactory, ScholarshipProgram, mocks/MockUSDT
test/        29 Hardhat tests
scripts/     deploy.js, export-abi.js, mint-usdt.js
frontend/    index, explorer (scholarship list), scholarship, apply, student, provider, reviewer, admin
docs/        SchoChain_Whitepaper.pdf (+ build_whitepaper.py)
```

## 1. Install and test
```bash
npm install --legacy-peer-deps
npx hardhat test
```
If your network blocks the Solidity compiler download, use the bundled solcjs fallback: `SOLCJS=1 npx hardhat test`.

## 2. Configure
```bash
cp .env.example .env     # set PRIVATE_KEY (funded with BOT for gas)
```
Networks (from `hardhat.config.js`): `botTestnet` chain 968 (`https://rpc.bohr.life`), `botMainnet` chain 677 (`https://rpc.botchain.ai`). Confirm both against the official BOT Chain docs before deploying.

## 3. Deploy
```bash
npx hardhat run scripts/deploy.js --network botTestnet
```
This deploys MockUSDT (testnet only, unless `USDT_ADDRESS` is set), ProviderRegistry, ApplicationRegistry, the ScholarshipProgram implementation and ScholarshipFactory, links the registry to the factory, and **overwrites `frontend/js/deployment.js`** and `deployments/<network>.json`.
For mainnet you **must** set `USDT_ADDRESS` to the real token; the script refuses to deploy the mock there.

The deployer becomes the platform admin. Use the Admin page (or a multisig via `transferOwnership` + `acceptOwnership` on the registry and factory) to manage verification.

Test USDT: `MINT_TO=0xYourWallet AMOUNT=1000 npx hardhat run scripts/mint-usdt.js --network botTestnet`.

## 4. Front end
`frontend/js/abi.js` is pre-generated; regenerate after contract changes with `npm run build`.
```bash
npx serve frontend        # any static host works; wallets need http(s), not file://
```
Set `explorer` in `frontend/js/deployment.js` if your explorer URL differs.

## 5. First run walkthrough
1. Provider wallet: **Provider** page → register organization.
2. Admin wallet: **Admin** page → verify the provider.
3. Provider: **Create program**, then **Manage → Fund**, then add reviewers.
4. Student wallet: **Scholarships → Apply**.
5. Provider: assign reviewers → reviewers submit reviews (**Reviewer** page) → provider decides → **Publish**.
6. Student: **Student** page → **Claim award**. Provider can also **Disburse**.
7. After the deadline and all decisions: **Close**, then **Withdraw surplus**. Or **Cancel** at any time.

## Privacy
Only wallet addresses, statuses, public eligibility declarations and document hashes are recorded. **A document hash does not make a document private, encrypted or stored** — see Section 5 of the whitepaper. Never put personal data into any text field.

## Known limits
Unaudited reference implementation. The front end has not been exercised in a live browser against a live chain in this build; run the walkthrough on testnet first. See whitepaper Section 9.
