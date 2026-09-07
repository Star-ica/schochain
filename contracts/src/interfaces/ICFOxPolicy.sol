// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICFOxPolicy {
    enum ExecutionMode {
        AUTO_EXECUTE,       // AI can execute directly
        MULTISIG_REQUIRED,  // needs equity-weighted approval
        BLOCKED             // not allowed at all
    }

    struct SpendingPolicy {
        uint256 perTransactionLimit;  // in token decimals (e.g. USDC 6 decimals)
        uint256 dailyLimit;
        uint256 weeklyLimit;
        uint256 mediumPaymentThreshold;  // basis points required for medium payments
        uint256 largePaymentThreshold;   // basis points required for large payments
        uint256 largePaymentAmount;      // USD amount that triggers "large" threshold
        bool recipientWhitelistEnabled;
    }

    event PolicyUpdated(SpendingPolicy policy);
    event RecipientWhitelisted(address indexed recipient, bool allowed);
    event DailySpendRecorded(uint256 amount, uint256 total);

    error PolicyViolation(string reason);
    error RecipientNotWhitelisted(address recipient);
    error ExceedsDailyLimit(uint256 attempted, uint256 remaining);
    error ExceedsTransactionLimit(uint256 attempted, uint256 limit);

    function checkAndRecordSpend(
        address token,
        address recipient,
        uint256 amount
    ) external returns (ExecutionMode mode, uint256 requiredWeight);

    function getPolicy() external view returns (SpendingPolicy memory);

    function updatePolicy(SpendingPolicy calldata policy) external;

    function setRecipientWhitelisted(address recipient, bool allowed) external;

    function isRecipientWhitelisted(address recipient) external view returns (bool);

    function getDailySpend() external view returns (uint256);

    function getWeeklySpend() external view returns (uint256);
}
