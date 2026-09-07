// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./CFOxGovernance.sol";
import "./CFOxTreasury.sol";
import "./CFOxPolicy.sol";

/// @title CFOxFactory
/// @notice Deploys an isolated (Governance, Treasury, Policy) triple for each founder.
///         Each founder gets their own independent CFO instance.
///         Users pay all their own gas. AI infrastructure is funded via a $5/28-day
///         subscription paid on-chain to the aiWallet address.
contract CFOxFactory {

    // ─── Types ────────────────────────────────────────────────────────────────

    struct CFOxInstance {
        address governance;
        address treasury;
        address policy;
        address founder;
        uint256 deployedAt;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice founder address → their deployed instance
    mapping(address => CFOxInstance) public instances;

    /// @notice All governance addresses ever deployed (for enumeration)
    address[] public allInstances;

    /// @notice Wallet that receives subscription payments (AI gas fund).
    ///         Set in constructor from env; never changes.
    address public immutable aiWallet;

    /// @notice Subscription fee in native token (wei).
    ///         Owner can update this to match $5 at current token price.
    uint256 public subscriptionFee;

    address public owner;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CFOxDeployed(
        address indexed founder,
        address governance,
        address treasury,
        address policy
    );

    event SubscriptionPaid(
        address indexed founder,
        address indexed treasury,
        uint256 amount,
        uint256 periodStart
    );

    event SubscriptionFeeUpdated(uint256 oldFee, uint256 newFee);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _aiWallet        Address that receives subscription fees.
    /// @param _subscriptionFee Initial fee in native wei (owner can update).
    constructor(address _aiWallet, uint256 _subscriptionFee) {
        require(_aiWallet != address(0), "CFOxFactory: zero ai wallet");
        aiWallet = _aiWallet;
        subscriptionFee = _subscriptionFee;
        owner = msg.sender;
    }

    // ─── Deploy ───────────────────────────────────────────────────────────────

    /// @notice Deploy a full CFOx suite for the caller.
    ///         Caller pays their own gas — no ETH needs to be sent here.
    /// @param founderName  Display name stored on the governance contract.
    /// @param usdcAddress  Initial ERC20 token to whitelist in the treasury.
    /// @param perTxLimit   Max amount auto-executed without multisig (6-decimal USDC).
    /// @param dailyLimit   Daily autonomous spend cap.
    /// @param weeklyLimit  Weekly autonomous spend cap.
    function deploy(
        string calldata founderName,
        address usdcAddress,
        uint256 perTxLimit,
        uint256 dailyLimit,
        uint256 weeklyLimit
    ) external returns (address governance, address treasury, address policy) {
        require(
            instances[msg.sender].governance == address(0),
            "CFOxFactory: already deployed"
        );
        require(usdcAddress != address(0), "CFOxFactory: zero token");

        // 1. Governance — founder is msg.sender; aiWallet is the agent
        CFOxGovernance gov = new CFOxGovernance(
            msg.sender,
            founderName,
            aiWallet
        );

        // 2. Treasury — factory address passed so setupAllowedToken works
        CFOxTreasury treas = new CFOxTreasury(address(gov), address(this));

        // 3. Policy
        CFOxPolicy pol = new CFOxPolicy(
            address(gov),
            perTxLimit,
            dailyLimit,
            weeklyLimit
        );

        // 4. Wire governance → treasury + policy
        gov.initialize(address(treas), address(pol));

        // 5. Whitelist the initial token (one-shot, factory-only)
        treas.setupAllowedToken(usdcAddress);

        // 6. Store
        instances[msg.sender] = CFOxInstance({
            governance:  address(gov),
            treasury:    address(treas),
            policy:      address(pol),
            founder:     msg.sender,
            deployedAt:  block.timestamp
        });
        allInstances.push(address(gov));

        emit CFOxDeployed(msg.sender, address(gov), address(treas), address(pol));
        return (address(gov), address(treas), address(pol));
    }

    // ─── Subscription ─────────────────────────────────────────────────────────

    /// @notice Pay for a 28-day AI subscription for your treasury.
    ///         Caller must be the founder of a deployed instance.
    ///         Sends exactly `subscriptionFee` native tokens to aiWallet.
    ///         The backend verifies this tx to activate the subscription period.
    function paySubscription() external payable {
        CFOxInstance storage inst = instances[msg.sender];
        require(inst.governance != address(0), "CFOxFactory: no instance");
        require(msg.value >= subscriptionFee, "CFOxFactory: insufficient fee");

        // Forward fee to AI wallet
        (bool ok,) = payable(aiWallet).call{value: msg.value}("");
        require(ok, "CFOxFactory: transfer failed");

        emit SubscriptionPaid(msg.sender, inst.treasury, msg.value, block.timestamp);
    }

    // ─── Owner admin ──────────────────────────────────────────────────────────

    /// @notice Update the subscription fee (e.g. to track $5 in token terms).
    function setSubscriptionFee(uint256 newFee) external {
        require(msg.sender == owner, "CFOxFactory: not owner");
        emit SubscriptionFeeUpdated(subscriptionFee, newFee);
        subscriptionFee = newFee;
    }

    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "CFOxFactory: not owner");
        require(newOwner != address(0), "CFOxFactory: zero address");
        owner = newOwner;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getInstance(address founder) external view returns (CFOxInstance memory) {
        return instances[founder];
    }

    function totalDeployed() external view returns (uint256) {
        return allInstances.length;
    }

    function hasInstance(address founder) external view returns (bool) {
        return instances[founder].governance != address(0);
    }
}