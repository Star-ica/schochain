// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Common.sol";

/// @title ProviderRegistry — scholarship provider (organization) registry.
/// @notice Stores only public organization info. Never put personal data here.
contract ProviderRegistry is Owned2Step {
    enum Status { None, Pending, Verified, Suspended }

    struct Provider {
        string name;
        string metadataURI; // public website / profile link
        Status status;
        uint64 registeredAt;
    }

    bool public requireVerification = true;
    mapping(address => Provider) private _providers;
    address[] private _list;

    event ProviderRegistered(address indexed provider, string name);
    event ProviderUpdated(address indexed provider, string name);
    event ProviderStatusChanged(address indexed provider, Status status);
    event RequireVerificationChanged(bool required);

    function register(string calldata name, string calldata metadataURI) external {
        require(_providers[msg.sender].status == Status.None, "already registered");
        _check(name, metadataURI);
        _providers[msg.sender] = Provider(name, metadataURI, Status.Pending, uint64(block.timestamp));
        _list.push(msg.sender);
        emit ProviderRegistered(msg.sender, name);
    }

    function updateProfile(string calldata name, string calldata metadataURI) external {
        require(_providers[msg.sender].status != Status.None, "not registered");
        _check(name, metadataURI);
        _providers[msg.sender].name = name;
        _providers[msg.sender].metadataURI = metadataURI;
        emit ProviderUpdated(msg.sender, name);
    }

    function verify(address p) external onlyOwner {
        require(_providers[p].status == Status.Pending, "not pending");
        _providers[p].status = Status.Verified;
        emit ProviderStatusChanged(p, Status.Verified);
    }

    function suspend(address p) external onlyOwner {
        Status s = _providers[p].status;
        require(s == Status.Pending || s == Status.Verified, "cannot suspend");
        _providers[p].status = Status.Suspended;
        emit ProviderStatusChanged(p, Status.Suspended);
    }

    function reinstate(address p) external onlyOwner {
        require(_providers[p].status == Status.Suspended, "not suspended");
        _providers[p].status = Status.Verified;
        emit ProviderStatusChanged(p, Status.Verified);
    }

    function setRequireVerification(bool v) external onlyOwner {
        requireVerification = v;
        emit RequireVerificationChanged(v);
    }

    function canCreatePrograms(address p) external view returns (bool) {
        Status s = _providers[p].status;
        return s == Status.Verified || (!requireVerification && s == Status.Pending);
    }

    function isSuspended(address p) external view returns (bool) {
        return _providers[p].status == Status.Suspended;
    }

    function getProvider(address p) external view returns (Provider memory) { return _providers[p]; }
    function providerCount() external view returns (uint256) { return _list.length; }
    function providerAt(uint256 i) external view returns (address) { return _list[i]; }

    function _check(string calldata name, string calldata uri) private pure {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "bad name");
        require(bytes(uri).length <= 160, "uri too long");
    }
}
