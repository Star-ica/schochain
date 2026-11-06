// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Testnet-only USDT stand-in (6 decimals, open mint). Never deploy to mainnet.
contract MockUSDT {
    string public name = "Mock USDT";
    string public symbol = "USDT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 v) external { balanceOf[to] += v; totalSupply += v; emit Transfer(address(0), to, v); }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; emit Approval(msg.sender, s, v); return true; }
    function transfer(address to, uint256 v) external returns (bool) { _move(msg.sender, to, v); return true; }
    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        require(a >= v, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        _move(f, t, v);
        return true;
    }
    function _move(address f, address t, uint256 v) private {
        require(balanceOf[f] >= v, "balance");
        balanceOf[f] -= v; balanceOf[t] += v; emit Transfer(f, t, v);
    }
}
