// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICFOxTreasury.sol";

/// @title CFOxTreasury
/// @notice Holds organization funds (native + ERC20) and executes approved transfers.
///         Only the Governance contract can trigger executions.
///         An emergency pause halts all outflows.
contract CFOxTreasury is ICFOxTreasury {
    // ─── State ────────────────────────────────────────────────────────────────

    address public governance;
    bool private _paused;
    string public pauseReason;

    /// @notice Factory that deployed this treasury. Used for one-shot token setup.
    address public immutable factory;
    /// @notice True once setupAllowedToken() has been called by the factory.
    bool public tokenSetupDone;

    /// @dev address(0) represents the native token (ETH/CELO/etc)
    mapping(address => bool) private _allowedTokens;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    modifier whenNotPaused() {
        if (_paused) revert TreasuryPaused();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _governance  The CFOxGovernance contract address.
    /// @param _factory     The CFOxFactory that deployed this contract (may be
    ///                     address(0) for direct/test deployments — in that case
    ///                     setupAllowedToken is permanently disabled).
    constructor(address _governance, address _factory) {
        if (_governance == address(0)) revert ZeroAddress();
        governance = _governance;
        factory = _factory;
        // Native token always allowed
        _allowedTokens[address(0)] = true;
        emit GovernanceSet(_governance);
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    /// @notice Execute a single payment. Called only by Governance after threshold is met.
    function execute(
        address token,
        address recipient,
        uint256 amount
    ) external override onlyGovernance whenNotPaused {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!_allowedTokens[token]) revert TokenNotAllowed(token);

        _transfer(token, recipient, amount);
        emit TreasuryPayment(token, recipient, amount);
    }

    /// @notice Execute multiple payments atomically.
    function executeBatch(
        address[] calldata tokens,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external override onlyGovernance whenNotPaused {
        uint256 len = tokens.length;
        require(len == recipients.length && len == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < len; ) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            if (!_allowedTokens[tokens[i]]) revert TokenNotAllowed(tokens[i]);

            _transfer(tokens[i], recipients[i], amounts[i]);
            emit TreasuryPayment(tokens[i], recipients[i], amounts[i]);

            unchecked { ++i; }
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice One-shot initial token whitelist called by the factory at deploy time.
    ///         Can never be called again once tokenSetupDone is true.
    ///         Only callable by the factory address set at construction.
    function setupAllowedToken(address token) external override {
        require(
            msg.sender == factory && factory != address(0) && !tokenSetupDone,
            "Not allowed"
        );
        tokenSetupDone = true;
        _allowedTokens[token] = true;
        emit AllowedTokenSet(token, true);
    }

    /// @notice Add or remove an allowed token via governance proposal.
    ///         Use this after initial deploy to whitelist additional tokens (e.g. WETH, cUSD).
    function setAllowedToken(address token, bool allowed) external override onlyGovernance {
        _allowedTokens[token] = allowed;
        emit AllowedTokenSet(token, allowed);
    }

    function pause(string calldata reason) external override onlyGovernance {
        _paused = true;
        pauseReason = reason;
        emit Paused(msg.sender, reason);
    }

    function unpause() external override onlyGovernance {
        _paused = false;
        pauseReason = "";
        emit Unpaused(msg.sender);
    }

    /// @notice Transfer governance to a new address (requires a governance proposal).
    function setGovernance(address _governance) external override onlyGovernance {
        if (_governance == address(0)) revert ZeroAddress();
        governance = _governance;
        emit GovernanceSet(_governance);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function balanceOf(address token) external view override returns (uint256) {
        if (token == address(0)) return address(this).balance;
        return _erc20BalanceOf(token, address(this));
    }

    function isPaused() external view override returns (bool) {
        return _paused;
    }

    function isTokenAllowed(address token) external view override returns (bool) {
        return _allowedTokens[token];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _transfer(address token, address recipient, uint256 amount) internal {
        if (token == address(0)) {
            uint256 bal = address(this).balance;
            if (bal < amount) revert InsufficientBalance(bal, amount);
            (bool ok,) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            uint256 bal = _erc20BalanceOf(token, address(this));
            if (bal < amount) revert InsufficientBalance(bal, amount);

            (bool ok, bytes memory data) = token.call(
                abi.encodeWithSignature("transfer(address,uint256)", recipient, amount)
            );
            if (!ok || (data.length > 0 && !abi.decode(data, (bool)))) {
                revert TransferFailed();
            }
        }
    }

    function _erc20BalanceOf(address token, address account) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        if (!ok || data.length < 32) return 0;
        return abi.decode(data, (uint256));
    }
}
