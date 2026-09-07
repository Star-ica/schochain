// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICFOxTreasury {
    // ─── Events ───────────────────────────────────────────────────────────────

    event TreasuryPayment(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event Deposited(address indexed sender, uint256 amount);
    event Paused(address indexed by, string reason);
    event Unpaused(address indexed by);
    event AllowedTokenSet(address indexed token, bool allowed);
    event GovernanceSet(address indexed governance);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotGovernance();
    error TreasuryPaused();
    error TokenNotAllowed(address token);
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 available, uint256 requested);
    error TransferFailed();

    // ─── Functions ────────────────────────────────────────────────────────────

    function execute(
        address token,
        address recipient,
        uint256 amount
    ) external;

    function executeBatch(
        address[] calldata tokens,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external;

    /// @notice Add/remove an allowed token. Called by governance via proposal.
    function setAllowedToken(address token, bool allowed) external;

    /// @notice One-shot token setup called by factory at deploy time only.
    function setupAllowedToken(address token) external;

    function pause(string calldata reason) external;

    function unpause() external;

    function setGovernance(address governance) external;

    function balanceOf(address token) external view returns (uint256);

    function isPaused() external view returns (bool);

    function isTokenAllowed(address token) external view returns (bool);
}
