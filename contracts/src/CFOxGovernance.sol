// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICFOxGovernance.sol";
import "./interfaces/ICFOxTreasury.sol";
import "./interfaces/ICFOxPolicy.sol";

contract CFOxGovernance is ICFOxGovernance {
    uint256 public constant TOTAL_WEIGHT = 10_000;
    uint256 public constant PROPOSAL_DURATION = 7 days;

    uint256 public constant THRESHOLD_MEDIUM     = 0;
    uint256 public constant THRESHOLD_LARGE      = 1;
    uint256 public constant THRESHOLD_GOVERNANCE = 2;
    uint256 public constant THRESHOLD_CRITICAL   = 3;

    ICFOxTreasury public treasury;
    ICFOxPolicy   public policy;

    address public agentAddress;

    uint256 public mediumThreshold     = 5_000;
    uint256 public largeThreshold      = 7_000;
    uint256 public governanceThreshold = 8_000;
    uint256 public criticalThreshold   = 9_000;

    mapping(address => Member)   private _members;
    address[]                    private _memberList;
    uint256                      private _totalActiveWeight;

    uint256                              private _proposalCount;
    mapping(uint256 => Proposal)         private _proposals;
    mapping(uint256 => mapping(address => uint256)) private _snapshots;
    mapping(uint256 => address[])        private _snapshotMembers;
    mapping(uint256 => mapping(address => bool))    private _hasSigned;

    modifier onlyActiveMember() {
        if (!_members[msg.sender].active) revert NotMember();
        _;
    }

    modifier onlyMemberOrAgent() {
        if (!_members[msg.sender].active && msg.sender != agentAddress) revert NotMember();
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        if (_proposals[proposalId].id == 0) revert ProposalNotFound(proposalId);
        _;
    }

    constructor(address founder, string memory founderName, address _agentAddress) {
        require(founder != address(0), "Zero founder");
        require(_agentAddress != address(0), "Zero agent");
        agentAddress = _agentAddress;
        _members[founder] = Member({ account: founder, weight: TOTAL_WEIGHT, active: true, createdAt: block.timestamp });
        _memberList.push(founder);
        _totalActiveWeight = TOTAL_WEIGHT;
        emit MemberAdded(founder, TOTAL_WEIGHT, founderName);
    }

    function initialize(address _treasury, address _policy) external {
        require(address(treasury) == address(0), "Already initialized");
        require(_treasury != address(0) && _policy != address(0), "Zero address");
        treasury = ICFOxTreasury(_treasury);
        policy   = ICFOxPolicy(_policy);
    }

    // ── createPaymentProposal ─────────────────────────────────────────────────
    // In interface ✓ → override ✓
    function createPaymentProposal(
        address token,
        address recipient,
        uint256 amount,
        string calldata description
    ) external override onlyMemberOrAgent returns (uint256 proposalId) {
        require(recipient != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");
        (ICFOxPolicy.ExecutionMode mode, uint256 requiredWeight) =
            policy.checkAndRecordSpend(token, recipient, amount);
        if (mode == ICFOxPolicy.ExecutionMode.AUTO_EXECUTE) {
            treasury.execute(token, recipient, amount);
            emit TreasuryPaymentDirect(token, recipient, amount);
            return 0;
        }
        bytes memory callData = abi.encode(token, recipient, amount);
        proposalId = _createProposal(ProposalType.PAYMENT, requiredWeight, callData, description);
    }

    // ── createAddMemberProposal ───────────────────────────────────────────────
    // Interface declares (address member, uint256 weight, string role)
    // Impl param name differs (newMember) — Solidity matches by TYPE not name.
    // However the interface uses `address member` and impl uses `address newMember`
    // which is fine — BUT override here triggers error 7792 meaning the compiler
    // cannot match them. Root cause: interface has no `override` keyword itself,
    // and the function signatures DO match by type. The real issue is the disk
    // file still has `override` here from an old version. No override needed —
    // this function IS in the interface, but we'll let it omit override since
    // the compiler is complaining. Actually we DO want override. The error only
    // fires if signatures don't match. Let's match exactly: param name irrelevant.
    // We'll add override and ensure sig matches interface exactly.
    function createAddMemberProposal(
        address member,
        uint256 weight,
        string calldata role
    ) external override onlyActiveMember returns (uint256 proposalId) {
        require(member != address(0), "Zero address");
        require(weight > 0 && weight < TOTAL_WEIGHT, "Invalid weight");
        require(!_members[member].active, "Already member");
        require(_members[msg.sender].weight >= weight, "Insufficient weight");
        bytes memory callData = abi.encode(msg.sender, member, weight, role);
        proposalId = _createProposal(ProposalType.ADD_MEMBER, largeThreshold, callData, role);
    }

    // ── createRemoveMemberProposal ────────────────────────────────────────────
    // In interface ✓ → override ✓
    function createRemoveMemberProposal(
        address member,
        address beneficiary
    ) external override onlyActiveMember returns (uint256 proposalId) {
        require(_members[member].active, "Not active member");
        require(_memberList.length > 1, "Cannot remove only member");
        require(beneficiary != address(0), "Zero beneficiary");
        require(beneficiary != member, "Cannot self-benefit");
        bytes memory callData = abi.encode(member, beneficiary);
        proposalId = _createProposal(ProposalType.REMOVE_MEMBER, largeThreshold, callData, "Remove member");
    }

    // ── createEquityTransferProposal ──────────────────────────────────────────
    // In interface ✓ → override ✓
    function createEquityTransferProposal(
        address from,
        address to,
        uint256 weight
    ) external override onlyActiveMember returns (uint256 proposalId) {
        require(_members[from].active, "From not active");
        require(weight > 0 && weight <= _members[from].weight, "Invalid weight");
        bytes memory callData = abi.encode(from, to, weight);
        proposalId = _createProposal(ProposalType.TRANSFER_EQUITY, largeThreshold, callData, "Equity transfer");
    }

    // ── createChangePolicyProposal ────────────────────────────────────────────
    // In interface ✓ → override ✓
    function createChangePolicyProposal(
        bytes calldata newPolicy,
        string calldata description
    ) external override onlyActiveMember returns (uint256 proposalId) {
        proposalId = _createProposal(ProposalType.CHANGE_POLICY, governanceThreshold, newPolicy, description);
    }

    // ── createChangeThresholdProposal ─────────────────────────────────────────
    // In interface ✓ → override ✓
    function createChangeThresholdProposal(
        uint256 thresholdType,
        uint256 newValue
    ) external override onlyActiveMember returns (uint256 proposalId) {
        require(newValue > 0 && newValue <= TOTAL_WEIGHT, "Invalid threshold value");
        bytes memory callData = abi.encode(thresholdType, newValue);
        proposalId = _createProposal(ProposalType.CHANGE_THRESHOLD, governanceThreshold, callData, "Change governance threshold");
    }

    // ── createEmergencyPauseProposal ──────────────────────────────────────────
    // In interface ✓ → override ✓
    function createEmergencyPauseProposal(
        string calldata reason
    ) external override onlyActiveMember returns (uint256 proposalId) {
        bytes memory callData = abi.encode(reason);
        proposalId = _createProposal(ProposalType.EMERGENCY_ACTION, criticalThreshold, callData, "Emergency pause");
    }

    // ── approve ───────────────────────────────────────────────────────────────
    function approve(uint256 proposalId) external override onlyActiveMember proposalExists(proposalId) {
        Proposal storage p = _proposals[proposalId];
        if (p.executed)  revert ProposalAlreadyExecuted(proposalId);
        if (p.cancelled) revert ProposalCancelledError(proposalId);
        if (block.timestamp > p.expiresAt) revert ProposalExpired(proposalId);
        if (_hasSigned[proposalId][msg.sender]) revert AlreadySigned(proposalId, msg.sender);
        uint256 snapshotWeight = _snapshots[proposalId][msg.sender];
        require(snapshotWeight > 0, "Not in snapshot");
        _hasSigned[proposalId][msg.sender] = true;
        p.approvedWeight += snapshotWeight;
        emit ProposalApproved(proposalId, msg.sender, snapshotWeight, p.approvedWeight);
    }

    // ── execute ───────────────────────────────────────────────────────────────
    function execute(uint256 proposalId) external override proposalExists(proposalId) {
        Proposal storage p = _proposals[proposalId];
        if (p.executed)  revert ProposalAlreadyExecuted(proposalId);
        if (p.cancelled) revert ProposalCancelledError(proposalId);
        if (block.timestamp > p.expiresAt) revert ProposalExpired(proposalId);
        if (p.approvedWeight < p.requiredWeight) revert ThresholdNotReached(p.requiredWeight, p.approvedWeight);
        p.executed = true;
        _executePayload(p.proposalType, p.callData);
        emit ProposalExecuted(proposalId);
    }

    // ── cancel ────────────────────────────────────────────────────────────────
    function cancel(uint256 proposalId) external override proposalExists(proposalId) {
        Proposal storage p = _proposals[proposalId];
        require(msg.sender == p.proposer || msg.sender == agentAddress, "Not proposer");
        require(!p.executed, "Already executed");
        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    // ── Internal ──────────────────────────────────────────────────────────────
    function _createProposal(
        ProposalType pType,
        uint256 requiredWeight,
        bytes memory callData,
        string memory description
    ) internal returns (uint256 proposalId) {
        proposalId = ++_proposalCount;
        bytes32 opHash = keccak256(abi.encode(block.chainid, address(treasury), proposalId, callData));
        Proposal storage p = _proposals[proposalId];
        p.id             = proposalId;
        p.proposer       = msg.sender;
        p.proposalType   = pType;
        p.operationHash  = opHash;
        p.requiredWeight = requiredWeight;
        p.approvedWeight = 0;
        p.snapshotBlock  = block.number;
        p.createdAt      = block.timestamp;
        p.expiresAt      = block.timestamp + PROPOSAL_DURATION;
        p.executed       = false;
        p.cancelled      = false;
        p.callData       = callData;
        address[] memory members = _memberList;
        address[] storage snapList = _snapshotMembers[proposalId];
        for (uint256 i = 0; i < members.length; ) {
            Member memory m = _members[members[i]];
            if (m.active) { _snapshots[proposalId][members[i]] = m.weight; snapList.push(members[i]); }
            unchecked { ++i; }
        }
        emit ProposalCreated(proposalId, pType, opHash, requiredWeight);
    }

    function _executePayload(ProposalType pType, bytes memory callData) internal {
        if (pType == ProposalType.PAYMENT) {
            (address token, address recipient, uint256 amount) = abi.decode(callData, (address, address, uint256));
            treasury.execute(token, recipient, amount);
        } else if (pType == ProposalType.ADD_MEMBER) {
            (address from, address newMember, uint256 weight, string memory role) = abi.decode(callData, (address, address, uint256, string));
            _addMember(from, newMember, weight, role);
        } else if (pType == ProposalType.REMOVE_MEMBER) {
            (address member, address beneficiary) = abi.decode(callData, (address, address));
            _removeMember(member, beneficiary);
        } else if (pType == ProposalType.TRANSFER_EQUITY) {
            (address from, address to, uint256 weight) = abi.decode(callData, (address, address, uint256));
            _transferEquity(from, to, weight);
        } else if (pType == ProposalType.CHANGE_THRESHOLD) {
            (uint256 thresholdType, uint256 newValue) = abi.decode(callData, (uint256, uint256));
            _changeThreshold(thresholdType, newValue);
        } else if (pType == ProposalType.CHANGE_POLICY) {
            (bool ok,) = address(policy).call(abi.encodeWithSignature("updatePolicyRaw(bytes)", callData));
            require(ok, "Policy update failed");
            emit PolicyChanged(address(policy));
        } else if (pType == ProposalType.EMERGENCY_ACTION) {
            (string memory reason) = abi.decode(callData, (string));
            treasury.pause(reason);
        }
    }

    function _changeThreshold(uint256 thresholdType, uint256 newValue) internal {
        require(newValue > 0 && newValue <= TOTAL_WEIGHT, "Invalid threshold");
        if      (thresholdType == THRESHOLD_MEDIUM)     { mediumThreshold = newValue; }
        else if (thresholdType == THRESHOLD_LARGE)      { largeThreshold = newValue; }
        else if (thresholdType == THRESHOLD_GOVERNANCE) { governanceThreshold = newValue; }
        else if (thresholdType == THRESHOLD_CRITICAL)   { criticalThreshold = newValue; }
        else { revert("Unknown threshold type"); }
        emit ThresholdChanged(thresholdType, newValue);
    }

    function _addMember(address from, address newMember, uint256 weight, string memory role) internal {
        require(!_members[newMember].active, "Already member");
        require(_members[from].active, "Donor not active");
        require(_members[from].weight >= weight, "Donor insufficient weight");
        _members[from].weight -= weight;
        _members[newMember] = Member({ account: newMember, weight: weight, active: true, createdAt: block.timestamp });
        _memberList.push(newMember);
        emit MemberAdded(newMember, weight, role);
        _assertWeightInvariant();
    }

    function _removeMember(address member, address beneficiary) internal {
        require(_members[member].active, "Not active");
        require(_memberList.length > 1, "Last member");
        require(beneficiary != address(0), "Zero beneficiary");
        require(beneficiary != member, "Cannot self-benefit");
        uint256 returnedWeight = _members[member].weight;
        _members[member].active = false;
        _members[member].weight = 0;
        _totalActiveWeight -= returnedWeight;
        if (!_members[beneficiary].active) {
            _members[beneficiary] = Member({ account: beneficiary, weight: returnedWeight, active: true, createdAt: block.timestamp });
            _memberList.push(beneficiary);
            emit MemberAdded(beneficiary, returnedWeight, "");
        } else {
            _members[beneficiary].weight += returnedWeight;
        }
        _totalActiveWeight += returnedWeight;
        emit MemberRemoved(member);
        _assertWeightInvariant();
    }

    function _transferEquity(address from, address to, uint256 weight) internal {
        require(_members[from].active, "From not active");
        require(_members[from].weight >= weight, "Insufficient weight");
        _members[from].weight -= weight;
        if (!_members[to].active) {
            _members[to] = Member({ account: to, weight: weight, active: true, createdAt: block.timestamp });
            _memberList.push(to);
            emit MemberAdded(to, weight, "");
        } else {
            _members[to].weight += weight;
        }
        emit EquityTransferred(from, to, weight);
        _assertWeightInvariant();
    }

    function _assertWeightInvariant() internal view {
        uint256 total = 0;
        for (uint256 i = 0; i < _memberList.length; ) {
            if (_members[_memberList[i]].active) total += _members[_memberList[i]].weight;
            unchecked { ++i; }
        }
        if (total != TOTAL_WEIGHT) revert WeightSumInvariant(total);
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function getMember(address account) external view override returns (Member memory) { return _members[account]; }
    function getProposal(uint256 proposalId) external view override returns (Proposal memory) { return _proposals[proposalId]; }
    function getSnapshotWeight(uint256 proposalId, address member) external view returns (uint256) { return _snapshots[proposalId][member]; }
    function hasSigned(uint256 proposalId, address member) external view returns (bool) { return _hasSigned[proposalId][member]; }
    function totalMembers() external view override returns (uint256) { return _memberList.length; }
    function totalEquity() external view override returns (uint256) { return _totalActiveWeight; }
    function getMembers() external view returns (address[] memory) { return _memberList; }
    function proposalCount() external view returns (uint256) { return _proposalCount; }

    event TreasuryPaymentDirect(address indexed token, address indexed recipient, uint256 amount);
}
