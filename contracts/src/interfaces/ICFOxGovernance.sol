// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICFOxGovernance {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum ProposalType {
        PAYMENT,
        BATCH_PAYMENT,
        ADD_MEMBER,
        REMOVE_MEMBER,
        TRANSFER_EQUITY,
        CHANGE_THRESHOLD,
        CHANGE_POLICY,
        EMERGENCY_ACTION
    }

    enum ProposalStatus {
        PENDING,
        APPROVED,
        EXECUTED,
        REJECTED,
        EXPIRED,
        CANCELLED
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Member {
        address account;
        uint256 weight;        // basis points: 10000 = 100%
        bool active;
        uint256 createdAt;
    }

    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        bytes32 operationHash;
        uint256 requiredWeight;
        uint256 approvedWeight;
        uint256 snapshotBlock;
        uint256 createdAt;
        uint256 expiresAt;
        bool executed;
        bool cancelled;
        bytes callData;        // encoded execution payload
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event MemberAdded(address indexed member, uint256 weight, string role);
    event MemberRemoved(address indexed member);
    event EquityTransferred(address indexed from, address indexed to, uint256 weight);
    event ProposalCreated(uint256 indexed proposalId, ProposalType proposalType, bytes32 operationHash, uint256 requiredWeight);
    event ProposalApproved(uint256 indexed proposalId, address indexed signer, uint256 weight, uint256 totalApproved);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event ThresholdChanged(uint256 indexed thresholdType, uint256 newValue);
    event PolicyChanged(address indexed policy);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotMember();
    error InactiveMember();
    error AlreadySigned(uint256 proposalId, address signer);
    error ProposalNotFound(uint256 proposalId);
    error ProposalExpired(uint256 proposalId);
    error ProposalAlreadyExecuted(uint256 proposalId);
    error ProposalCancelledError(uint256 proposalId);
    error ThresholdNotReached(uint256 required, uint256 current);
    error InvalidWeight();
    error WeightSumInvariant(uint256 sum);
    error DuplicateMember(address member);
    error CannotRemoveOnlyMember();
    error InvalidProposalData();
    error Unauthorized();

    // ─── Functions ────────────────────────────────────────────────────────────

    function createPaymentProposal(
        address token,
        address recipient,
        uint256 amount,
        string calldata description
    ) external returns (uint256 proposalId);

    function createAddMemberProposal(
        address member,
        uint256 weight,
        string calldata role
    ) external returns (uint256 proposalId);

    function createRemoveMemberProposal(
        address member
    ) external returns (uint256 proposalId);

    function createEquityTransferProposal(
        address from,
        address to,
        uint256 weight
    ) external returns (uint256 proposalId);

    function approve(uint256 proposalId) external;

    function execute(uint256 proposalId) external;

    function cancel(uint256 proposalId) external;

    function getMember(address account) external view returns (Member memory);

    function getProposal(uint256 proposalId) external view returns (Proposal memory);

    function totalMembers() external view returns (uint256);

    function totalEquity() external view returns (uint256);
}
