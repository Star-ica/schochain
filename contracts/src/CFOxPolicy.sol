// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICFOxPolicy.sol";

/// @title CFOxPolicy
/// @notice Onchain enforcement of AI spending limits and governance thresholds.
///         This is the "truth layer" — the backend policy engine uses the same
///         logic offchain, but this contract is what actually enforces it.
contract CFOxPolicy is ICFOxPolicy {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant BASIS_POINTS = 10_000;

    // ─── State ────────────────────────────────────────────────────────────────

    address public governance;
    SpendingPolicy private _policy;

    mapping(address => bool) private _whitelistedRecipients;

    // Daily/weekly spend tracking
    // Keyed by day/week number (block.timestamp / period)
    mapping(uint256 => uint256) private _dailySpend;
    mapping(uint256 => uint256) private _weeklySpend;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyGovernance() {
        require(msg.sender == governance, "Not governance");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _governance  The CFOxGovernance contract address
    /// @param perTxLimit   Per-transaction autonomous limit (in token base units)
    /// @param dailyLimit   Daily autonomous spending limit
    /// @param weeklyLimit  Weekly autonomous spending limit
    constructor(
        address _governance,
        uint256 perTxLimit,
        uint256 dailyLimit,
        uint256 weeklyLimit
    ) {
        require(_governance != address(0), "Zero address");
        governance = _governance;

        _policy = SpendingPolicy({
            perTransactionLimit: perTxLimit,
            dailyLimit: dailyLimit,
            weeklyLimit: weeklyLimit,
            mediumPaymentThreshold: 5_000,  // 50% — medium payments
            largePaymentThreshold: 7_000,   // 70% — large payments
            largePaymentAmount: 1_000e6,    // $1,000 USDC (6 decimals) triggers large
            recipientWhitelistEnabled: false
        });

        emit PolicyUpdated(_policy);
    }

    // ─── Core Policy Check ────────────────────────────────────────────────────

    /// @notice Called by Governance before creating/executing a proposal.
    ///         Returns the execution mode and required weight for the amount.
    /// @dev    Also records spend against daily/weekly counters when AUTO_EXECUTE.
    function checkAndRecordSpend(
        address token,
        address recipient,
        uint256 amount
    ) external override onlyGovernance returns (ExecutionMode mode, uint256 requiredWeight) {
        SpendingPolicy memory p = _policy;

        // 1. Recipient whitelist check
        if (p.recipientWhitelistEnabled && !_whitelistedRecipients[recipient]) {
            revert RecipientNotWhitelisted(recipient);
        }

        // 2. Determine execution mode by amount
        if (amount <= p.perTransactionLimit) {
            // Check daily limit
            uint256 day = block.timestamp / 1 days;
            uint256 newDaily = _dailySpend[day] + amount;
            if (newDaily > p.dailyLimit) {
                return (ExecutionMode.MULTISIG_REQUIRED, p.mediumPaymentThreshold);
            }

            // Check weekly limit
            uint256 week = block.timestamp / 7 days;
            uint256 newWeekly = _weeklySpend[week] + amount;
            if (newWeekly > p.weeklyLimit) {
                // Fall through to multisig — don't revert, just escalate
                mode = ExecutionMode.MULTISIG_REQUIRED;
                requiredWeight = p.mediumPaymentThreshold;
                return (mode, requiredWeight);
            }

            // Record spend
            _dailySpend[day] = newDaily;
            _weeklySpend[week] = newWeekly;
            emit DailySpendRecorded(amount, newDaily);

            return (ExecutionMode.AUTO_EXECUTE, 0);
        }

        // 3. Large payment threshold
        if (amount >= p.largePaymentAmount) {
            return (ExecutionMode.MULTISIG_REQUIRED, p.largePaymentThreshold);
        }

        // 4. Medium payment threshold
        return (ExecutionMode.MULTISIG_REQUIRED, p.mediumPaymentThreshold);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Called by governance contract's _executePayload for CHANGE_POLICY proposals.
    ///         Receives raw ABI-encoded SpendingPolicy bytes and decodes them here.
    function updatePolicyRaw(bytes calldata encoded) external onlyGovernance {
        SpendingPolicy memory p = abi.decode(encoded, (SpendingPolicy));
        require(p.mediumPaymentThreshold <= BASIS_POINTS, "Invalid threshold");
        require(p.largePaymentThreshold <= BASIS_POINTS, "Invalid threshold");
        require(p.mediumPaymentThreshold <= p.largePaymentThreshold, "Thresholds inverted");
        _policy = p;
        emit PolicyUpdated(p);
    }

    function updatePolicy(SpendingPolicy calldata policy) external override onlyGovernance {
        require(policy.mediumPaymentThreshold <= BASIS_POINTS, "Invalid threshold");
        require(policy.largePaymentThreshold <= BASIS_POINTS, "Invalid threshold");
        require(policy.mediumPaymentThreshold <= policy.largePaymentThreshold, "Thresholds inverted");
        _policy = policy;
        emit PolicyUpdated(policy);
    }

    function setRecipientWhitelisted(address recipient, bool allowed) external override onlyGovernance {
        _whitelistedRecipients[recipient] = allowed;
        emit RecipientWhitelisted(recipient, allowed);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getPolicy() external view override returns (SpendingPolicy memory) {
        return _policy;
    }

    function isRecipientWhitelisted(address recipient) external view override returns (bool) {
        return _whitelistedRecipients[recipient];
    }

    function getDailySpend() external view override returns (uint256) {
        return _dailySpend[block.timestamp / 1 days];
    }

    function getWeeklySpend() external view override returns (uint256) {
        return _weeklySpend[block.timestamp / 7 days];
    }
}
