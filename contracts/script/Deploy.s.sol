// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/CFOxFactory.sol";

/// @notice Deploy the CFOxFactory (factory-per-user pattern).
///
///         This deploys ONLY the factory — a one-time, admin/deployer-run
///         transaction. Each founder subsequently deploys their own
///         (Governance, Treasury, Policy) triple by calling factory.deploy()
///         from their own wallet via the frontend (see useFactory.ts) — never
///         from this script, and never paid for by the deployer.
///
///         Required env vars:
///           AGENT_ADDRESS         — AI wallet that receives subscription fees
///                                   and creates governance proposals (set in
///                                   env once, never supplied by users)
///           SUBSCRIPTION_FEE_WEI  — fee in native wei (~$5 worth of CELO at
///                                   deploy time), e.g. 2500000000000000000
///                                   = 2.5 CELO
///
///         Optional env vars (smoke-test only — see below):
///           USDC_ADDRESS      — if set, also runs a one-off test deploy()
///                               using this script's own broadcaster as the
///                               founder, to sanity-check the whole flow
///                               end-to-end on a testnet. Omit in prod.
///           FOUNDER_NAME      — "Founder"        (smoke-test only)
///           PER_TX_LIMIT      — 100_000_000      ($100 USDC, 6 decimals)
///           DAILY_LIMIT       — 500_000_000      ($500 USDC)
///           WEEKLY_LIMIT      — 2_000_000_000    ($2,000 USDC)
///
///         Users pay all their own gas. The AI wallet is funded via
///         paySubscription(), not by this script.
contract Deploy is Script {
    function run() external {
        // ── Env ───────────────────────────────────────────────────────────────
        address agentWallet     = vm.envAddress("AGENT_ADDRESS");
        uint256 subscriptionFee = vm.envOr("SUBSCRIPTION_FEE_WEI", uint256(2.5 ether)); // ~$5 at $2/CELO

        // ── Deploy factory ──────────────────────────────────────────────────────
        vm.startBroadcast();

        CFOxFactory factory = new CFOxFactory(agentWallet, subscriptionFee);

        console.log("\n=== CFOxFactory Deployment ===");
        console.log("Factory:          ", address(factory));
        console.log("AI wallet:        ", agentWallet);
        console.log("Subscription fee: ", subscriptionFee);

        // ── Optional smoke test ──────────────────────────────────────────────
        // Only runs if USDC_ADDRESS is set. Calls factory.deploy() using this
        // same broadcaster as the founder — fine for a throwaway testnet key,
        // never intended for a real founder's mainnet deploy.
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        if (usdcAddress != address(0)) {
            string memory founderName = vm.envOr("FOUNDER_NAME", string("Founder"));
            uint256 perTxLimit  = vm.envOr("PER_TX_LIMIT",  uint256(100e6));    // $100
            uint256 dailyLimit  = vm.envOr("DAILY_LIMIT",   uint256(500e6));    // $500
            uint256 weeklyLimit = vm.envOr("WEEKLY_LIMIT",  uint256(2_000e6));  // $2,000

            (address governance, address treasury, address policy) = factory.deploy(
                founderName,
                usdcAddress,
                perTxLimit,
                dailyLimit,
                weeklyLimit
            );

            console.log("\n=== Smoke-test instance ===");
            console.log("Governance:   ", governance);
            console.log("Treasury:     ", treasury);
            console.log("Policy:       ", policy);
            console.log("Per-tx limit: ", perTxLimit);
            console.log("Daily limit:  ", dailyLimit);
            console.log("Weekly limit: ", weeklyLimit);
        }

        vm.stopBroadcast();

        console.log("\nUsers call factory.deploy() from their own wallet to create a treasury.");
        console.log("Users call factory.paySubscription() to fund AI gas (28-day period).");
    }
}