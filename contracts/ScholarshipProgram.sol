// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Common.sol";
import "./ProviderRegistry.sol";
import "./ApplicationRegistry.sol";

/// @title ScholarshipProgram
/// @notice One scholarship = one contract (cloned by the factory). It contains the program's
///         treasury, reviewer authorization, application book, decision/award manager,
///         student claim/disbursement manager and refund/cancellation logic.
///
/// PRIVACY: this contract never receives personal data. Applications hold a wallet address,
/// a public eligibility-declaration bitmask, a document HASH and an optional short pointer.
/// A hash proves a document was not altered; it does NOT make the document private, and it is
/// NOT storage. Everything onchain is public.
contract ScholarshipProgram is ReentrancyGuard {
    // ───────────────────────────── types
    enum Currency { BOT, USDT }
    enum State { Active, Closed, Cancelled }
    enum Status { None, Submitted, InReview, Approved, Rejected, Claimed, Withdrawn, Expired, Cancelled }
    enum Decision { None, Approve, Reject }

    struct CreateParams {
        string title;
        string summary;
        string infoURI;
        string[] criteria;      // public eligibility criteria labels (max 16)
        uint256 requiredMask;   // bits (by criteria index) every applicant must declare
        Currency currency;
        uint256 awardAmount;    // fixed amount per award, in token base units (wei for BOT)
        uint32 maxAwards;
        uint64 deadline;        // application deadline (unix seconds)
        uint32 requiredReviews; // reviews needed before a decision may be recorded
        uint32 claimWindowDays; // days a published award stays claimable
    }

    struct Application {
        address student;
        uint64 submittedAt;
        uint64 decidedAt;
        uint64 claimDeadline;
        uint64 claimedAt;
        Status status;
        Decision decision;
        bool published;
        uint16 reviewCount;
        uint32 scoreSum;
        uint256 declaredMask;
        bytes32 docHash;
        bytes32 reasonHash;
        string docRef;
    }

    struct Review {
        uint8 score;
        bool recommend;
        bytes32 notesHash;
        uint64 at;
    }

    struct ApplicationView {
        uint256 id;
        address student;
        Status status;      // effective status shown to students
        Decision decision;  // raw pending/published decision (public onchain regardless)
        bool published;
        uint64 submittedAt;
        uint64 decidedAt;
        uint64 claimDeadline;
        uint64 claimedAt;
        uint16 reviewCount;
        uint32 avgScore;
        uint256 declaredMask;
        bytes32 docHash;
        bytes32 reasonHash;
        string docRef;
    }

    struct Overview {
        address provider;
        string title;
        string summary;
        string infoURI;
        address token;
        uint256 awardAmount;
        uint32 maxAwards;
        uint64 deadline;
        uint64 createdAt;
        uint32 requiredReviews;
        uint32 claimWindowDays;
        uint256 requiredMask;
        State state;
        uint256 totalFunded;
        uint256 totalPaid;
        uint256 totalRefunded;
        uint256 committed;
        uint256 applicationCount;
        uint32 awardCount;
        uint256 undecided;
    }

    // ───────────────────────────── storage
    address public factory;
    address public provider;
    ProviderRegistry public registry;
    ApplicationRegistry public appRegistry;
    address public token; // address(0) = native BOT

    string public title;
    string public summary;
    string public infoURI;
    string[] private _criteria;
    uint256 public requiredMask;
    uint256 public awardAmount;
    uint32 public maxAwards;
    uint64 public createdAt;
    uint64 public deadline;
    uint32 public requiredReviews;
    uint32 public claimWindowDays;

    State public state;
    bool private _initialized;

    uint256 public totalFunded;
    uint256 public totalPaid;
    uint256 public totalRefunded;
    uint256 public committed;          // funds reserved for approved, unpaid awards
    uint256 public reservedUnpublished; // portion of `committed` whose decision is not yet published
    uint32 public awardCount;          // approved awards that are reserved or paid
    uint256 public undecided;          // applications with no recorded decision (and not withdrawn)

    uint256 public applicationCount;
    mapping(uint256 => Application) private _apps;
    mapping(address => uint256) public applicationOf;

    mapping(address => bool) public isReviewer;
    address[] private _reviewers;
    mapping(address => uint256[]) private _queue;
    mapping(uint256 => address[]) private _assigned;
    mapping(uint256 => mapping(address => bool)) public isAssigned;
    mapping(uint256 => mapping(address => Review)) private _reviews;
    mapping(uint256 => mapping(address => bool)) public hasReviewed;

    // ───────────────────────────── events
    event Funded(address indexed from, uint256 amount, uint256 totalFunded);
    event ReviewerAdded(address indexed reviewer);
    event ReviewerRemoved(address indexed reviewer);
    event ReviewerAssigned(uint256 indexed appId, address indexed reviewer);
    event ApplicationSubmitted(uint256 indexed appId, address indexed student, bytes32 docHash, uint256 declaredMask);
    event ApplicationWithdrawn(uint256 indexed appId, address indexed student);
    event ReviewSubmitted(uint256 indexed appId, address indexed reviewer, uint8 score, bool recommend, bytes32 notesHash);
    event DecisionRecorded(uint256 indexed appId, Decision decision, bytes32 reasonHash);
    event DecisionPublished(uint256 indexed appId, Status status, uint64 claimDeadline);
    event AwardPaid(uint256 indexed appId, address indexed student, uint256 amount, address indexed paidBy);
    event AwardExpired(uint256 indexed appId, uint256 released);
    event ProgramClosed();
    event ProgramCancelled(uint256 releasedUnpublished);
    event SurplusWithdrawn(address indexed to, uint256 amount);

    // ───────────────────────────── modifiers
    modifier onlyProvider() {
        require(msg.sender == provider, "not provider");
        _;
    }

    modifier providerInGoodStanding() {
        require(!registry.isSuspended(provider), "provider suspended");
        _;
    }

    constructor() {
        _initialized = true; // lock the implementation contract
    }

    // ───────────────────────────── initialization
    function initialize(
        address provider_,
        address registry_,
        address appRegistry_,
        address token_,
        CreateParams calldata p
    ) external {
        require(!_initialized, "initialized");
        _initialized = true;
        factory = msg.sender;

        require(bytes(p.title).length > 0 && bytes(p.title).length <= 96, "bad title");
        require(bytes(p.summary).length <= 400, "summary too long");
        require(bytes(p.infoURI).length <= 160, "uri too long");
        require(p.criteria.length <= 16, "too many criteria");
        for (uint256 i = 0; i < p.criteria.length; i++) {
            require(bytes(p.criteria[i]).length > 0 && bytes(p.criteria[i]).length <= 120, "bad criterion");
            _criteria.push(p.criteria[i]);
        }
        require(p.requiredMask >> p.criteria.length == 0, "mask out of range");
        require(p.awardAmount > 0, "zero award");
        require(p.maxAwards > 0 && p.maxAwards <= 10_000, "bad max awards");
        require(p.deadline > block.timestamp && p.deadline <= block.timestamp + 730 days, "bad deadline");
        require(p.requiredReviews >= 1 && p.requiredReviews <= 5, "bad review quorum");
        require(p.claimWindowDays >= 7 && p.claimWindowDays <= 365, "bad claim window");

        provider = provider_;
        registry = ProviderRegistry(registry_);
        appRegistry = ApplicationRegistry(appRegistry_);
        token = token_;
        title = p.title;
        summary = p.summary;
        infoURI = p.infoURI;
        requiredMask = p.requiredMask;
        awardAmount = p.awardAmount;
        maxAwards = p.maxAwards;
        createdAt = uint64(block.timestamp);
        deadline = p.deadline;
        requiredReviews = p.requiredReviews;
        claimWindowDays = p.claimWindowDays;
    }

    // ───────────────────────────── treasury
    function available() public view returns (uint256) {
        return totalFunded - totalPaid - totalRefunded;
    }

    function unallocated() public view returns (uint256) {
        return available() - committed;
    }

    /// @notice Fund the pool with native BOT (programs whose currency is BOT).
    function fund() external payable onlyProvider providerInGoodStanding {
        require(token == address(0), "token program");
        require(state != State.Cancelled, "cancelled");
        require(msg.value > 0, "zero amount");
        totalFunded += msg.value;
        emit Funded(msg.sender, msg.value, totalFunded);
    }

    /// @notice Fund the pool with the program's ERC-20 (USDT). Approve this contract first.
    function fundToken(uint256 amount) external onlyProvider providerInGoodStanding nonReentrant {
        require(token != address(0), "native program");
        require(state != State.Cancelled, "cancelled");
        require(amount > 0, "zero amount");
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        SafeTransfer.safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        require(received > 0, "nothing received");
        totalFunded += received; // credit what actually arrived (fee-on-transfer safe)
        emit Funded(msg.sender, received, totalFunded);
    }

    // ───────────────────────────── reviewer authorization
    function addReviewer(address r) external onlyProvider providerInGoodStanding {
        require(state != State.Cancelled, "cancelled");
        require(r != address(0) && r != provider, "bad reviewer");
        require(!isReviewer[r], "already reviewer");
        require(applicationOf[r] == 0, "reviewer is an applicant");
        isReviewer[r] = true;
        _reviewers.push(r);
        appRegistry.recordReviewer(r);
        emit ReviewerAdded(r);
    }

    function removeReviewer(address r) external onlyProvider {
        require(isReviewer[r], "not reviewer");
        isReviewer[r] = false;
        emit ReviewerRemoved(r);
    }

    function assignReviewers(uint256 appId, address[] calldata rs) external onlyProvider providerInGoodStanding {
        Application storage a = _app(appId);
        require(state == State.Active, "not active");
        require(_open(a), "application not open");
        require(a.decision == Decision.None, "decision recorded");
        require(_assigned[appId].length + rs.length <= 10, "too many reviewers");
        for (uint256 i = 0; i < rs.length; i++) {
            address r = rs[i];
            require(isReviewer[r], "not a reviewer");
            require(!isAssigned[appId][r], "already assigned");
            require(r != a.student, "conflict of interest");
            isAssigned[appId][r] = true;
            _assigned[appId].push(r);
            _queue[r].push(appId);
            emit ReviewerAssigned(appId, r);
        }
    }

    // ───────────────────────────── applications
    /// @param declaredMask public eligibility declarations (bit i = criterion i)
    /// @param docHash      keccak/sha256 of an off-chain document bundle. A hash is NOT privacy or storage.
    /// @param docRef       optional short, NON-sensitive pointer (max 160 bytes). Leave empty if unsure.
    function applyForScholarship(uint256 declaredMask, bytes32 docHash, string calldata docRef)
        external
        providerInGoodStanding
        returns (uint256 id)
    {
        require(state == State.Active, "not accepting applications");
        require(block.timestamp <= deadline, "deadline passed");
        require(msg.sender != provider && !isReviewer[msg.sender], "role conflict");
        require(applicationOf[msg.sender] == 0, "already applied");
        require(declaredMask & requiredMask == requiredMask, "eligibility not declared");
        require(declaredMask >> _criteria.length == 0, "mask out of range");
        require(docHash != bytes32(0), "document hash required");
        require(bytes(docRef).length <= 160, "docRef too long");

        id = ++applicationCount;
        Application storage a = _apps[id];
        a.student = msg.sender;
        a.submittedAt = uint64(block.timestamp);
        a.status = Status.Submitted;
        a.declaredMask = declaredMask;
        a.docHash = docHash;
        a.docRef = docRef;
        applicationOf[msg.sender] = id;
        undecided++;
        appRegistry.recordApplication(msg.sender, id);
        emit ApplicationSubmitted(id, msg.sender, docHash, declaredMask);
    }

    function withdrawApplication(uint256 appId) external {
        Application storage a = _app(appId);
        require(msg.sender == a.student, "not applicant");
        require(_open(a) && a.decision == Decision.None, "cannot withdraw");
        a.status = Status.Withdrawn;
        undecided--;
        emit ApplicationWithdrawn(appId, msg.sender);
    }

    // ───────────────────────────── review
    function submitReview(uint256 appId, uint8 score, bool recommend, bytes32 notesHash) external {
        Application storage a = _app(appId);
        require(state == State.Active, "not active");
        require(isReviewer[msg.sender], "not authorized reviewer");
        require(isAssigned[appId][msg.sender], "not assigned");
        require(!hasReviewed[appId][msg.sender], "already reviewed");
        require(_open(a) && !a.published, "application not open");
        require(score <= 100, "score > 100");
        hasReviewed[appId][msg.sender] = true;
        _reviews[appId][msg.sender] = Review(score, recommend, notesHash, uint64(block.timestamp));
        a.reviewCount++;
        a.scoreSum += score;
        a.status = Status.InReview;
        emit ReviewSubmitted(appId, msg.sender, score, recommend, notesHash);
    }

    // ───────────────────────────── decisions & awards
    /// @notice Record (or, until published, revise) a decision. Approvals reserve funds immediately,
    ///         so awards can never be over-allocated relative to the funded pool or `maxAwards`.
    function decide(uint256 appId, bool approve, bytes32 reasonHash) external onlyProvider providerInGoodStanding {
        require(state == State.Active, "not active");
        Application storage a = _app(appId);
        require(!a.published, "already published");
        require(_open(a), "application not open");
        require(a.reviewCount >= requiredReviews, "review quorum not met");

        if (a.decision == Decision.Approve) {
            _release();
        } else if (a.decision == Decision.None) {
            undecided--;
        }
        if (approve) {
            require(awardCount < maxAwards, "max awards reached");
            require(committed + awardAmount <= available(), "insufficient pool funds");
            committed += awardAmount;
            reservedUnpublished += awardAmount;
            awardCount++;
            a.decision = Decision.Approve;
        } else {
            a.decision = Decision.Reject;
        }
        a.reasonHash = reasonHash;
        a.decidedAt = uint64(block.timestamp);
        emit DecisionRecorded(appId, a.decision, reasonHash);
    }

    function publishDecisions(uint256[] calldata ids) external onlyProvider providerInGoodStanding {
        require(state != State.Cancelled, "cancelled");
        require(ids.length > 0 && ids.length <= 100, "bad batch");
        for (uint256 i = 0; i < ids.length; i++) {
            Application storage a = _app(ids[i]);
            require(a.decision != Decision.None, "no decision");
            require(!a.published, "already published");
            a.published = true;
            if (a.decision == Decision.Approve) {
                a.status = Status.Approved;
                a.claimDeadline = uint64(block.timestamp) + uint64(claimWindowDays) * 1 days;
                reservedUnpublished -= awardAmount;
            } else {
                a.status = Status.Rejected;
            }
            emit DecisionPublished(ids[i], a.status, a.claimDeadline);
        }
    }

    /// @notice Student pulls an approved, published award to their own wallet.
    function claim(uint256 appId) external nonReentrant {
        Application storage a = _app(appId);
        require(msg.sender == a.student, "not applicant");
        _pay(appId, a);
    }

    /// @notice Provider pushes an approved, published award to the student's wallet.
    function disburse(uint256 appId) external onlyProvider nonReentrant {
        Application storage a = _app(appId);
        _pay(appId, a);
    }

    function _pay(uint256 appId, Application storage a) private {
        require(a.status == Status.Approved && a.published, "not payable");
        require(block.timestamp <= a.claimDeadline, "claim window closed");
        address to = a.student;
        uint256 amt = awardAmount;
        // effects before interactions
        a.status = Status.Claimed;
        a.claimedAt = uint64(block.timestamp);
        committed -= amt;
        totalPaid += amt;
        if (token == address(0)) SafeTransfer.sendNative(to, amt);
        else SafeTransfer.safeTransfer(token, to, amt);
        emit AwardPaid(appId, to, amt, msg.sender);
    }

    /// @notice Release funds reserved for an award the student never claimed in time.
    function expireAward(uint256 appId) external onlyProvider {
        Application storage a = _app(appId);
        require(a.status == Status.Approved && block.timestamp > a.claimDeadline, "not expirable");
        a.status = Status.Expired;
        committed -= awardAmount;
        awardCount--;
        emit AwardExpired(appId, awardAmount);
    }

    // ───────────────────────────── close / cancel / refund
    function closeProgram() external onlyProvider {
        require(state == State.Active, "not active");
        require(block.timestamp > deadline, "deadline not passed");
        require(undecided == 0, "undecided applications");
        state = State.Closed;
        emit ProgramClosed();
    }

    /// @notice Stop the program. Unpublished approvals are voided and their funds released;
    ///         awards already PUBLISHED stay claimable until their own claim deadline.
    function cancelProgram() external onlyProvider {
        require(state == State.Active, "not active");
        uint256 released = reservedUnpublished;
        if (released > 0) {
            committed -= released;
            awardCount -= uint32(released / awardAmount);
            reservedUnpublished = 0;
        }
        state = State.Cancelled;
        emit ProgramCancelled(released);
    }

    /// @notice Return unreserved funds to the provider once the program is closed or cancelled.
    function withdrawSurplus(uint256 amount) external onlyProvider nonReentrant {
        require(state != State.Active, "program still active");
        require(amount > 0 && amount <= unallocated(), "exceeds surplus");
        totalRefunded += amount;
        if (token == address(0)) SafeTransfer.sendNative(provider, amount);
        else SafeTransfer.safeTransfer(token, provider, amount);
        emit SurplusWithdrawn(provider, amount);
    }

    // ───────────────────────────── views
    function overview() external view returns (Overview memory o) {
        o.provider = provider;
        o.title = title;
        o.summary = summary;
        o.infoURI = infoURI;
        o.token = token;
        o.awardAmount = awardAmount;
        o.maxAwards = maxAwards;
        o.deadline = deadline;
        o.createdAt = createdAt;
        o.requiredReviews = requiredReviews;
        o.claimWindowDays = claimWindowDays;
        o.requiredMask = requiredMask;
        o.state = state;
        o.totalFunded = totalFunded;
        o.totalPaid = totalPaid;
        o.totalRefunded = totalRefunded;
        o.committed = committed;
        o.applicationCount = applicationCount;
        o.awardCount = awardCount;
        o.undecided = undecided;
    }

    function criteriaList() external view returns (string[] memory) { return _criteria; }
    function reviewerList() external view returns (address[] memory) { return _reviewers; }
    function queueOf(address r) external view returns (uint256[] memory) { return _queue[r]; }
    function assignedTo(uint256 appId) external view returns (address[] memory) { return _assigned[appId]; }
    function getReview(uint256 appId, address r) external view returns (Review memory) { return _reviews[appId][r]; }

    function getApplication(uint256 appId) external view returns (ApplicationView memory) {
        return _view(appId);
    }

    function getApplications(uint256 from, uint256 limit) external view returns (ApplicationView[] memory out) {
        if (from == 0) from = 1;
        if (from > applicationCount) return new ApplicationView[](0);
        uint256 n = applicationCount - from + 1;
        if (n > limit) n = limit;
        out = new ApplicationView[](n);
        for (uint256 i = 0; i < n; i++) out[i] = _view(from + i);
    }

    // ───────────────────────────── internals
    function _app(uint256 id) private view returns (Application storage a) {
        require(id != 0 && id <= applicationCount, "unknown application");
        a = _apps[id];
    }

    function _open(Application storage a) private view returns (bool) {
        return a.status == Status.Submitted || a.status == Status.InReview;
    }

    function _release() private {
        committed -= awardAmount;
        reservedUnpublished -= awardAmount;
        awardCount--;
    }

    function _view(uint256 id) private view returns (ApplicationView memory v) {
        Application storage a = _app(id);
        v.id = id;
        v.student = a.student;
        Status s = a.status;
        if (state == State.Cancelled && (s == Status.Submitted || s == Status.InReview)) s = Status.Cancelled;
        v.status = s;
        v.decision = a.decision;
        v.published = a.published;
        v.submittedAt = a.submittedAt;
        v.decidedAt = a.decidedAt;
        v.claimDeadline = a.claimDeadline;
        v.claimedAt = a.claimedAt;
        v.reviewCount = a.reviewCount;
        v.avgScore = a.reviewCount == 0 ? 0 : a.scoreSum / a.reviewCount;
        v.declaredMask = a.declaredMask;
        v.docHash = a.docHash;
        v.reasonHash = a.reasonHash;
        v.docRef = a.docRef;
    }
}
