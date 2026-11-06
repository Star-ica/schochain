// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Common.sol";

interface IProgramFactory {
    function isProgram(address a) external view returns (bool);
}

/// @title ApplicationRegistry — global index of applications and reviewer roles.
/// @notice Only programs created by the factory can write here. Holds identifiers
///         and pointers only: (program, local application id) per student wallet.
contract ApplicationRegistry is Owned2Step {
    struct Ref {
        address program;
        uint256 appId;
    }

    address public factory;
    mapping(address => Ref[]) private _byStudent;
    mapping(address => address[]) private _reviewerPrograms;

    event ApplicationIndexed(bytes32 indexed key, address indexed student, address indexed program, uint256 appId);
    event ReviewerIndexed(address indexed reviewer, address indexed program);

    function setFactory(address f) external onlyOwner {
        require(factory == address(0) && f != address(0), "factory set");
        factory = f;
    }

    modifier onlyProgram() {
        require(factory != address(0) && IProgramFactory(factory).isProgram(msg.sender), "not a program");
        _;
    }

    function recordApplication(address student, uint256 appId) external onlyProgram {
        _byStudent[student].push(Ref(msg.sender, appId));
        emit ApplicationIndexed(keccak256(abi.encode(msg.sender, appId)), student, msg.sender, appId);
    }

    function recordReviewer(address reviewer) external onlyProgram {
        _reviewerPrograms[reviewer].push(msg.sender);
        emit ReviewerIndexed(reviewer, msg.sender);
    }

    function applicationsOf(address student) external view returns (Ref[] memory) { return _byStudent[student]; }
    function reviewerPrograms(address reviewer) external view returns (address[] memory) { return _reviewerPrograms[reviewer]; }

    function applicationKey(address program, uint256 appId) external pure returns (bytes32) {
        return keccak256(abi.encode(program, appId));
    }
}
