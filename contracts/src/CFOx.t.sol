// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/CFOxGovernance.sol";
import "../src/CFOxTreasury.sol";
import "../src/CFOxPolicy.sol";
import "../src/CFOxFactory.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    string public name    = "USD Coin";
    string public symbol  = "USDC";
    uint8  public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract CFOxTest is Test {
    CFOxGovernance public gov;
    CFOxTreasury   public treas;
    CFOxPolicy     public pol;
    CFOxFactory    public factory;
    MockUSDC       public usdc;

    address founder  = address(0xF0);
    address cfo      = address(0xCF);
    address cto      = address(0xC7);
    address agent    = address(0xAA);
    address vendor   = address(0xDE);
    address attacker = address(0xBAD);

    uint256 constant PER_TX  = 100e6;
    uint256 constant DAILY   = 500e6;
    uint256 constant WEEKLY  = 2_000e6;

    function setUp() public {
        usdc    = new MockUSDC();
        factory = new CFOxFactory();

        vm.prank(founder);
        (address g, address t, address p) = factory.deploy(
            "Founder", agent, address(usdc), PER_TX, DAILY, WEEKLY
        );

        gov   = CFOxGovernance(g);
        treas = CFOxTreasury(payable(t));
        pol   = CFOxPolicy(p);

        usdc.mint(address(treas), 100_000e6);
    }

    function test_FounderHas100Percent() public view {
        ICFOxGovernance.Member memory m = gov.getMember(founder);
        assertEq(m.weight, 10_000);
        assertTrue(m.active);
    }

    function test_TotalEquityIs10000() public view {
        assertEq(gov.totalEquity(), 10_000);
    }

    function test_TreasuryBalance() public view {
        assertEq(treas.balanceOf(address(usdc)), 100_000e6);
    }

    function test_FactoryRecordsInstance() public view {
        CFOxFactory.CFOxInstance memory inst = factory.getInstance(founder);
        assertEq(inst.governance, address(gov));
        assertEq(inst.treasury,   address(treas));
        assertEq(inst.policy,     address(pol));
        assertEq(inst.founder,    founder);
        assertEq(factory.totalDeployed(), 1);
    }

    function test_CannotDeployTwice() public {
        vm.prank(founder);
        vm.expectRevert("CFOxFactory: already deployed");
        factory.deploy("Founder2", agent, address(usdc), PER_TX, DAILY, WEEKLY);
    }

    function test_TwoFoundersGetSeparateInstances() public {
        address founder2 = address(0xF2);
        vm.prank(founder2);
        (address g2, address t2,) = factory.deploy(
            "Founder2", agent, address(usdc), PER_TX, DAILY, WEEKLY
        );
        assertTrue(g2 != address(gov));
        assertTrue(t2 != address(treas));
        assertEq(factory.totalDeployed(), 2);
    }

    function test_USDCWhitelistedByFactory() public view {
        assertTrue(treas.isTokenAllowed(address(usdc)));
        assertTrue(treas.tokenSetupDone());
    }

    function test_SetupAllowedTokenCannotBeCalledAgain() public {
        vm.expectRevert("Not allowed");
        treas.setupAllowedToken(address(usdc));
    }

    function test_SmallPaymentAutoExecutes() public {
        uint256 vendorBefore = usdc.balanceOf(vendor);
        vm.prank(agent);
        uint256 proposalId = gov.createPaymentProposal(address(usdc), vendor, 50e6, "Small vendor payment");
        assertEq(proposalId, 0);
        assertEq(usdc.balanceOf(vendor), vendorBefore + 50e6);
    }

    function test_SmallPaymentRespectsDailyLimit() public {
        vm.startPrank(agent);
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p1");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p2");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p3");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p4");
        gov.createPaymentProposal(address(usdc), vendor, 100e6, "p5");
        vm.stopPrank();

        vm.prank(agent);
        uint256 proposalId = gov.createPaymentProposal(address(usdc), vendor, 50e6, "over daily");
        assertTrue(proposalId > 0, "Should require multisig after daily limit");
    }

    function test_MediumPaymentCreatesProposal() public {
        vm.prank(founder);
        uint256 proposalId = gov.createPaymentProposal(address(usdc), vendor, 500e6, "Marketing");
        assertTrue(proposalId > 0);
        ICFOxGovernance.Proposal memory p = gov.getProposal(proposalId);
        assertEq(p.requiredWeight, 5_000);
        assertFalse(p.executed);
    }

    function test_FounderAloneCanApproveAndExecute() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "Pay designer");

        vm.prank(founder);
        gov.approve(pid);

        uint256 vendorBefore = usdc.balanceOf(vendor);
        gov.execute(pid);
        assertEq(usdc.balanceOf(vendor), vendorBefore + 500e6);
        assertTrue(gov.getProposal(pid).executed);
    }

    function test_CannotExecuteTwice() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");
        vm.prank(founder);
        gov.approve(pid);
        gov.execute(pid);
        vm.expectRevert(abi.encodeWithSelector(ICFOxGovernance.ProposalAlreadyExecuted.selector, pid));
        gov.execute(pid);
    }

    function test_CannotSignTwice() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");
        vm.startPrank(founder);
        gov.approve(pid);
        vm.expectRevert(abi.encodeWithSelector(ICFOxGovernance.AlreadySigned.selector, pid, founder));
        gov.approve(pid);
        vm.stopPrank();
    }

    function test_NonMemberCannotSign() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 200e6, "x");
        vm.prank(attacker);
        vm.expectRevert(ICFOxGovernance.NotMember.selector);
        gov.approve(pid);
    }

    function test_SnapshotIsolatesWeightChanges() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "test");
        assertEq(gov.getSnapshotWeight(pid, founder), 10_000);
        assertEq(gov.getSnapshotWeight(pid, founder), 10_000);
    }

    function test_ExecutionFailsIfThresholdNotMet() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");
        vm.expectRevert(abi.encodeWithSelector(ICFOxGovernance.ThresholdNotReached.selector, 5_000, 0));
        gov.execute(pid);
    }

    function test_ExpiredProposalCannotBeExecuted() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");
        vm.prank(founder);
        gov.approve(pid);
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(abi.encodeWithSelector(ICFOxGovernance.ProposalExpired.selector, pid));
        gov.execute(pid);
    }

    function test_PausedTreasuryBlocksPayments() public {
        vm.prank(address(gov));
        treas.pause("Security incident");
        assertTrue(treas.isPaused());
        vm.prank(address(gov));
        vm.expectRevert(ICFOxTreasury.TreasuryPaused.selector);
        treas.execute(address(usdc), vendor, 100e6);
    }

    function test_UnpauseRestoresPayments() public {
        vm.startPrank(address(gov));
        treas.pause("test");
        treas.unpause();
        vm.stopPrank();
        assertFalse(treas.isPaused());
    }

    function test_UnallowedTokenReverts() public {
        address fakeToken = address(0xBADF00D);
        vm.prank(address(gov));
        vm.expectRevert(abi.encodeWithSelector(ICFOxTreasury.TokenNotAllowed.selector, fakeToken));
        treas.execute(fakeToken, vendor, 100e6);
    }

    function test_GovernanceCanAddMoreTokens() public {
        address newToken = address(0xBEEF);
        vm.prank(address(gov));
        treas.setAllowedToken(newToken, true);
        assertTrue(treas.isTokenAllowed(newToken));
    }

    function test_AttackerCannotCallTreasuryDirectly() public {
        vm.prank(attacker);
        vm.expectRevert(ICFOxTreasury.NotGovernance.selector);
        treas.execute(address(usdc), attacker, 100_000e6);
    }

    function test_EquityTransferProposalFlow() public {
        vm.prank(founder);
        uint256 pid = gov.createEquityTransferProposal(founder, cfo, 2_000);
        vm.prank(founder);
        gov.approve(pid);
        gov.execute(pid);
        assertEq(gov.getMember(founder).weight, 8_000);
        assertEq(gov.getMember(cfo).weight,     2_000);
        assertEq(gov.totalEquity(), 10_000);
    }

    function test_WeightSumNeverExceedsTotalWeight() public view {
        assertEq(gov.totalEquity(), 10_000);
    }

    function test_ProposerCanCancelProposal() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");
        vm.prank(agent);
        gov.cancel(pid);
        assertTrue(gov.getProposal(pid).cancelled);
    }

    function test_CancelledProposalCannotBeExecuted() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");
        vm.prank(founder);
        gov.approve(pid);
        vm.prank(agent);
        gov.cancel(pid);
        vm.expectRevert(abi.encodeWithSelector(ICFOxGovernance.ProposalCancelledError.selector, pid));
        gov.execute(pid);
    }

    function test_OperationHashIncludesChainId() public {
        vm.prank(agent);
        uint256 pid = gov.createPaymentProposal(address(usdc), vendor, 500e6, "x");
        ICFOxGovernance.Proposal memory p = gov.getProposal(pid);
        bytes32 expectedHash = keccak256(abi.encode(
            block.chainid, address(treas), pid,
            abi.encode(address(usdc), vendor, uint256(500e6))
        ));
        assertEq(p.operationHash, expectedHash);
    }
}
