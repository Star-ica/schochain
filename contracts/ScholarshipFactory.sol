// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Common.sol";
import "./ProviderRegistry.sol";
import "./ApplicationRegistry.sol";
import "./ScholarshipProgram.sol";

/// @title ScholarshipFactory — deploys one isolated treasury+program contract per scholarship (EIP-1167 clones).
contract ScholarshipFactory is Owned2Step {
    ProviderRegistry public immutable registry;
    ApplicationRegistry public immutable appRegistry;
    address public immutable implementation;
    address public usdt;
    bool public paused;

    address[] private _programs;
    mapping(address => bool) public isProgram;
    mapping(address => address[]) private _byProvider;

    event ProgramCreated(address indexed program, address indexed provider, string title, ScholarshipProgram.Currency currency);
    event UsdtSet(address token);
    event PausedSet(bool paused);

    constructor(address registry_, address appRegistry_, address implementation_, address usdt_) {
        require(registry_ != address(0) && appRegistry_ != address(0) && implementation_ != address(0), "zero address");
        registry = ProviderRegistry(registry_);
        appRegistry = ApplicationRegistry(appRegistry_);
        implementation = implementation_;
        usdt = usdt_;
    }

    function setUsdt(address token) external onlyOwner {
        require(token == address(0) || token.code.length > 0, "not a contract");
        usdt = token;
        emit UsdtSet(token);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    function createProgram(ScholarshipProgram.CreateParams calldata p) external returns (address program) {
        require(!paused, "paused");
        require(registry.canCreatePrograms(msg.sender), "provider not verified");
        address token;
        if (p.currency == ScholarshipProgram.Currency.USDT) {
            token = usdt;
            require(token != address(0), "USDT not configured");
        }
        address impl = implementation;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            program := create(0, ptr, 0x37)
        }
        require(program != address(0), "clone failed");
        // Registered before initialize so the new program may write to the application registry.
        isProgram[program] = true;
        _programs.push(program);
        _byProvider[msg.sender].push(program);
        ScholarshipProgram(program).initialize(msg.sender, address(registry), address(appRegistry), token, p);
        emit ProgramCreated(program, msg.sender, p.title, p.currency);
    }

    function programCount() external view returns (uint256) { return _programs.length; }
    function programAt(uint256 i) external view returns (address) { return _programs[i]; }
    function allPrograms() external view returns (address[] memory) { return _programs; }
    function programsOf(address provider) external view returns (address[] memory) { return _byProvider[provider]; }
}
