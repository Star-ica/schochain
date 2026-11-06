// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address a) external view returns (uint256);
    function transfer(address to, uint256 v) external returns (bool);
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function decimals() external view returns (uint8);
}

library SafeTransfer {
    error TransferFailed();
    error NotAContract();

    function safeTransfer(address token, address to, uint256 amt) internal {
        if (token.code.length == 0) revert NotAContract();
        (bool ok, bytes memory d) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amt));
        if (!ok || (d.length != 0 && !abi.decode(d, (bool)))) revert TransferFailed();
    }

    function safeTransferFrom(address token, address from, address to, uint256 amt) internal {
        if (token.code.length == 0) revert NotAContract();
        (bool ok, bytes memory d) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amt));
        if (!ok || (d.length != 0 && !abi.decode(d, (bool)))) revert TransferFailed();
    }

    function sendNative(address to, uint256 amt) internal {
        (bool ok, ) = to.call{value: amt}("");
        if (!ok) revert TransferFailed();
    }
}

/// @dev Clone-friendly: the zero state counts as "not entered".
abstract contract ReentrancyGuard {
    uint256 private _lock;

    modifier nonReentrant() {
        require(_lock != 2, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }
}

/// @dev Minimal two-step ownership used by the platform-level contracts.
abstract contract Owned2Step {
    address public owner;
    address public pendingOwner;

    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "zero address");
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "not pending owner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
