// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArcDrop} from "../ArcDrop.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @title ArcDropTest
/// @notice Comprehensive Foundry unit tests for ArcDrop.sol
///
/// Scenarios covered:
///  1.  Public drop — valid claim
///  2.  Allowlist (GATED) drop — per-wallet amounts via Merkle proof
///  3.  Invalid Merkle proof — wrong proof bytes
///  4.  Modified reward amount — correct proof, wrong amount (leaf mismatch)
///  5.  Wrong recipient address — proof generated for a different address
///  6.  Duplicate claim — same wallet claims twice
///  7.  Cross-campaign proof replay — proof from drop A used against drop B
///  8.  Insufficient funding — totalAmount exhausted
///  9.  Token transfer failure — mock that reverts on transfer
/// 10.  Expired campaign — block.timestamp past expiresAt
/// 11.  Decimal conversion — 6-decimal USDC, verify no rounding loss
/// 12.  Empty/boundary amounts — zero-value and min-boundary guard checks
/// 13.  Duplicate recipients — on-chain duplicate-claim prevention via hasClaimed
/// 14.  Maximum claim limits — drop exactly hits maxClaims, next reverts InsufficientFunds
/// 15.  Mystery drop — payout is within [minAmount, maxAmount]
/// 16.  Refund — creator refunds; non-creator cannot
/// 17.  Pause/unpause — claim reverts when paused, succeeds after unpause
contract ArcDropTest is Test {
    // ── Contracts under test ──────────────────────────────────────────────────
    ArcDrop  internal arcDrop;
    MockERC20 internal token;   // 18-decimal token
    MockERC20 internal usdc;    // 6-decimal "USDC"

    // ── Test actors ───────────────────────────────────────────────────────────
    address internal owner        = makeAddr("owner");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal creator      = makeAddr("creator");
    address internal alice        = makeAddr("alice");
    address internal bob          = makeAddr("bob");
    address internal carol        = makeAddr("carol");
    address internal dave         = makeAddr("dave");
    address internal eve          = makeAddr("eve");

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 internal constant FEE_BPS         = 100;   // 1 %
    uint256 internal constant AMOUNT_PER_CLAIM = 100e18;
    uint256 internal constant TOTAL_AMOUNT    = 1_000e18;

    // USDC-precision constants (6 decimals)
    uint256 internal constant USDC_PER_CLAIM  = 50e6;
    uint256 internal constant USDC_TOTAL      = 500e6;

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        // Deploy tokens
        token = new MockERC20("Test Token", "TKN", 18);
        usdc  = new MockERC20("Mock USDC",  "mUSDC", 6);

        // Deploy ArcDrop — USDC address passed as constructor arg (not a constant)
        vm.startPrank(owner);
        arcDrop = new ArcDrop(address(usdc), feeRecipient, FEE_BPS, owner);
        vm.stopPrank();

        // Fund creator with tokens
        token.mint(creator, 10_000e18);
        usdc.mint(creator, 10_000e6);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// @dev Build a minimal 1-leaf Merkle tree: the "root" is the leaf itself.
    function _singleLeaf(address addr, uint256 amt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(addr, amt));
    }

    /// @dev Build a 2-leaf sorted-pair tree and return (root, proof for leaf0, proof for leaf1).
    function _twoLeafTree(
        address addr0, uint256 amt0,
        address addr1, uint256 amt1
    ) internal pure returns (
        bytes32 root,
        bytes32[] memory proof0,
        bytes32[] memory proof1
    ) {
        bytes32 leaf0 = keccak256(abi.encodePacked(addr0, amt0));
        bytes32 leaf1 = keccak256(abi.encodePacked(addr1, amt1));

        // Sorted-pair parent — mirrors the contract's _verifyMerkleProof
        bytes32 parent = leaf0 <= leaf1
            ? keccak256(abi.encodePacked(leaf0, leaf1))
            : keccak256(abi.encodePacked(leaf1, leaf0));

        root = parent;

        proof0 = new bytes32[](1);
        proof0[0] = leaf1;

        proof1 = new bytes32[](1);
        proof1[0] = leaf0;
    }

    /// @dev Build a 4-leaf sorted-pair Merkle tree (for multi-wallet allowlists).
    ///      Returns root and the proof for leaf[index].
    function _fourLeafTree(
        bytes32[4] memory leaves,
        uint256 index
    ) internal pure returns (bytes32 root, bytes32[] memory proof) {
        // Level 1 (parents of pairs 0-1 and 2-3)
        bytes32 p01 = leaves[0] <= leaves[1]
            ? keccak256(abi.encodePacked(leaves[0], leaves[1]))
            : keccak256(abi.encodePacked(leaves[1], leaves[0]));

        bytes32 p23 = leaves[2] <= leaves[3]
            ? keccak256(abi.encodePacked(leaves[2], leaves[3]))
            : keccak256(abi.encodePacked(leaves[3], leaves[2]));

        // Level 2 (root)
        root = p01 <= p23
            ? keccak256(abi.encodePacked(p01, p23))
            : keccak256(abi.encodePacked(p23, p01));

        proof = new bytes32[](2);
        if (index == 0) {
            proof[0] = leaves[1];
            proof[1] = p23;
        } else if (index == 1) {
            proof[0] = leaves[0];
            proof[1] = p23;
        } else if (index == 2) {
            proof[0] = leaves[3];
            proof[1] = p01;
        } else {
            proof[0] = leaves[2];
            proof[1] = p01;
        }
    }

    /// @dev Creates a PUBLIC drop and returns its dropId.
    function _createPublicDrop(
        uint256 totalAmt,
        uint256 perClaim,
        uint256 maxClaims,
        uint256 expiresAt
    ) internal returns (uint256 dropId) {
        vm.startPrank(creator);
        token.approve(address(arcDrop), totalAmt);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = totalAmt;
        p.amountPerClaim = perClaim;
        p.maxClaims      = maxClaims;
        p.expiresAt      = expiresAt;
        p.name           = "Public Drop";
        dropId = arcDrop.createDrop(p);
        vm.stopPrank();
    }

    /// @dev Creates an ALLOWLIST (GATED) drop with the given Merkle root.
    function _createAllowlistDrop(
        uint256 totalAmt,
        uint256 maxClaims,
        bytes32 merkleRoot,
        address tokenAddr
    ) internal returns (uint256 dropId) {
        vm.startPrank(creator);
        MockERC20(tokenAddr).approve(address(arcDrop), totalAmt);
        ArcDrop.CreateDropParams memory p;
        p.dropType    = ArcDrop.DropType.GATED;
        p.gatingType  = ArcDrop.GatingType.ALLOWLIST;
        p.totalAmount = totalAmt;
        p.maxClaims   = maxClaims;
        p.merkleRoot  = merkleRoot;
        p.name        = "Allowlist Drop";
        dropId = arcDrop.createDrop(p);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Valid claim — PUBLIC drop
    // ─────────────────────────────────────────────────────────────────────────

    function test_PublicDrop_ValidClaim() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 feeBefore   = token.balanceOf(feeRecipient);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        uint256 fee    = (AMOUNT_PER_CLAIM * FEE_BPS) / 10_000;
        uint256 net    = AMOUNT_PER_CLAIM - fee;

        assertEq(token.balanceOf(alice),        aliceBefore + net,  "alice net amount");
        assertEq(token.balanceOf(feeRecipient), feeBefore + fee,    "fee recipient");
        assertTrue(arcDrop.hasClaimed(dropId, alice), "hasClaimed flag");

        ArcDrop.Drop memory drop = arcDrop.getDrop(dropId);
        assertEq(drop.claimedCount,  1,               "claimedCount");
        assertEq(drop.totalClaimed,  AMOUNT_PER_CLAIM,"totalClaimed");
    }

    function test_PublicDrop_EmitsClaimed() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        uint256 fee = (AMOUNT_PER_CLAIM * FEE_BPS) / 10_000;
        uint256 net = AMOUNT_PER_CLAIM - fee;

        vm.expectEmit(true, true, false, true, address(arcDrop));
        emit ArcDrop.Claimed(dropId, alice, net, AMOUNT_PER_CLAIM);
        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Valid claim — ALLOWLIST (GATED) drop with different amounts per wallet
    // ─────────────────────────────────────────────────────────────────────────

    function test_AllowlistDrop_ValidClaim_DifferentAmounts() public {
        uint256 amtAlice = 200e18;
        uint256 amtBob   = 300e18;
        uint256 total    = amtAlice + amtBob;

        (bytes32 root, bytes32[] memory proofAlice, bytes32[] memory proofBob) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(total, 2, root, address(token));

        // Alice claims her assigned amount
        uint256 feeAlice = (amtAlice * FEE_BPS) / 10_000;
        vm.prank(alice);
        arcDrop.claim(dropId, proofAlice, amtAlice);
        assertEq(token.balanceOf(alice), amtAlice - feeAlice, "alice balance");

        // Bob claims his (different) assigned amount
        uint256 feeBob = (amtBob * FEE_BPS) / 10_000;
        vm.prank(bob);
        arcDrop.claim(dropId, proofBob, amtBob);
        assertEq(token.balanceOf(bob), amtBob - feeBob, "bob balance");
    }

    function test_AllowlistDrop_VerifyProof_ReturnsTrue() public {
        uint256 amtAlice = 200e18;
        uint256 amtBob   = 300e18;
        (bytes32 root, bytes32[] memory proofAlice,) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(amtAlice + amtBob, 2, root, address(token));

        assertTrue(arcDrop.verifyProof(dropId, alice, amtAlice, proofAlice), "valid proof returns true");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Invalid Merkle proof — wrong proof bytes
    // ─────────────────────────────────────────────────────────────────────────

    function test_AllowlistDrop_InvalidProof_Reverts() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 100e18;
        (bytes32 root,,) = _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(200e18, 2, root, address(token));

        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = bytes32(uint256(0xdeadbeef));   // garbage proof element

        vm.prank(alice);
        vm.expectRevert(ArcDrop.InvalidProof.selector);
        arcDrop.claim(dropId, badProof, amtAlice);
    }

    function test_AllowlistDrop_VerifyProof_ReturnsFalse_BadProof() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 100e18;
        (bytes32 root,,) = _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(200e18, 2, root, address(token));

        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = bytes32(uint256(0xdeadbeef));

        assertFalse(arcDrop.verifyProof(dropId, alice, amtAlice, badProof), "bad proof returns false");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Modified reward amount — correct proof but wrong amount (leaf mismatch)
    // ─────────────────────────────────────────────────────────────────────────

    function test_AllowlistDrop_WrongAmount_Reverts() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 200e18;
        (bytes32 root, bytes32[] memory proofAlice,) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(amtAlice + amtBob, 2, root, address(token));

        // Alice tries to claim MORE than her assigned amount using her valid proof
        uint256 inflated = amtAlice + 1e18;
        vm.prank(alice);
        vm.expectRevert(ArcDrop.InvalidProof.selector);
        arcDrop.claim(dropId, proofAlice, inflated);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Wrong recipient address — proof generated for a different address
    // ─────────────────────────────────────────────────────────────────────────

    function test_AllowlistDrop_WrongRecipient_Reverts() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 200e18;
        // Generate proof for alice's leaf, but bob tries to use it as his own
        (bytes32 root, bytes32[] memory proofAlice,) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(amtAlice + amtBob, 2, root, address(token));

        // Bob uses alice's proof — leaf(bob, amtAlice) won't match
        vm.prank(bob);
        vm.expectRevert(ArcDrop.InvalidProof.selector);
        arcDrop.claim(dropId, proofAlice, amtAlice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Duplicate claim — same wallet claims twice
    // ─────────────────────────────────────────────────────────────────────────

    function test_DuplicateClaim_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.AlreadyClaimed.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    function test_DuplicateClaim_Allowlist_Reverts() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 100e18;
        (bytes32 root, bytes32[] memory proofAlice,) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        uint256 dropId = _createAllowlistDrop(amtAlice + amtBob, 4, root, address(token));

        vm.prank(alice);
        arcDrop.claim(dropId, proofAlice, amtAlice);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.AlreadyClaimed.selector);
        arcDrop.claim(dropId, proofAlice, amtAlice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Cross-campaign proof replay — proof valid for drop A used against drop B
    // ─────────────────────────────────────────────────────────────────────────

    function test_CrossCampaignReplay_Reverts() public {
        uint256 amtAlice = 100e18;
        uint256 amtBob   = 200e18;

        // Drop A: alice + bob
        (bytes32 rootA, bytes32[] memory proofAliceA,) =
            _twoLeafTree(alice, amtAlice, bob, amtBob);

        // Drop B: alice + carol with a DIFFERENT root
        uint256 amtCarol = 150e18;
        (bytes32 rootB,,) = _twoLeafTree(alice, amtAlice, carol, amtCarol);

        uint256 dropIdA = _createAllowlistDrop(amtAlice + amtBob,   2, rootA, address(token));
        uint256 dropIdB = _createAllowlistDrop(amtAlice + amtCarol, 2, rootB, address(token));

        // proofAliceA is valid for drop A but NOT for drop B (different root)
        vm.prank(alice);
        vm.expectRevert(ArcDrop.InvalidProof.selector);
        arcDrop.claim(dropIdB, proofAliceA, amtAlice);

        // Confirm it still works on drop A
        vm.prank(alice);
        arcDrop.claim(dropIdA, proofAliceA, amtAlice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Insufficient funding — totalAmount exhausted
    // ─────────────────────────────────────────────────────────────────────────

    function test_InsufficientFunds_Reverts() public {
        // totalAmount = 2 × amountPerClaim → exactly 2 claimable slots
        uint256 perClaim = 100e18;
        uint256 total    = 200e18;
        uint256 dropId   = _createPublicDrop(total, perClaim, 0, 0);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        vm.prank(bob);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        // Third claim exhausts the funds
        vm.prank(carol);
        vm.expectRevert(ArcDrop.InsufficientFunds.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Token transfer failure — mock ERC-20 that reverts on transfer
    // ─────────────────────────────────────────────────────────────────────────

    function test_TransferFailure_Reverts() public {
        // Create the drop normally
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        // Now make the token revert on transfer
        token.setRevertOnTransfer(true);

        vm.prank(alice);
        vm.expectRevert();   // SafeERC20 will bubble the revert
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Expired campaign
    // ─────────────────────────────────────────────────────────────────────────

    function test_ExpiredDrop_Reverts() public {
        uint256 expiry = block.timestamp + 1 days;
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, expiry);

        // Warp past expiry
        vm.warp(expiry + 1);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.DropExpired.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    function test_ClaimBeforeExpiry_Succeeds() public {
        uint256 expiry = block.timestamp + 1 days;
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, expiry);

        // Still within expiry window
        vm.warp(expiry - 1);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);  // should not revert

        assertTrue(arcDrop.hasClaimed(dropId, alice));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Decimal conversion — 6-decimal USDC, no rounding loss
    // ─────────────────────────────────────────────────────────────────────────

    function test_USDCDecimalPrecision_NoRoundingLoss() public {
        // amountPerClaim = 50_000_001 µUSDC (not divisible evenly at 1 bps)
        // fee = (50_000_001 * 100) / 10_000 = 500_000 (integer div, remainder 1)
        // net = 50_000_001 - 500_000 = 49_500_001
        uint256 perClaim = 50_000_001;   // 50.000001 USDC
        uint256 total    = perClaim * 10;

        vm.startPrank(creator);
        usdc.approve(address(arcDrop), total);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = total;
        p.amountPerClaim = perClaim;
        p.maxClaims      = 10;
        p.name           = "USDC Decimal Test";
        uint256 dropId   = arcDrop.createDrop(p);
        vm.stopPrank();

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 feeBefore   = usdc.balanceOf(feeRecipient);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        uint256 fee = (perClaim * FEE_BPS) / 10_000;
        uint256 net = perClaim - fee;

        assertEq(usdc.balanceOf(alice),        aliceBefore + net, "net to claimer (no loss)");
        assertEq(usdc.balanceOf(feeRecipient), feeBefore + fee,   "fee collected");
        // Verify net + fee = perClaim (conservation)
        assertEq(net + fee, perClaim, "net + fee = gross");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Empty/boundary amount handling — contract-level guards
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateDrop_ZeroTotalAmount_Reverts() public {
        vm.startPrank(creator);
        token.approve(address(arcDrop), 1e18);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = 0;               // invalid
        p.amountPerClaim = 1e18;
        p.name           = "bad";
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        arcDrop.createDrop(p);
        vm.stopPrank();
    }

    function test_CreateDrop_AmountPerClaimExceedsTotal_Reverts() public {
        vm.startPrank(creator);
        token.approve(address(arcDrop), 1e18);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = 1e18;
        p.amountPerClaim = 2e18;            // exceeds total
        p.name           = "bad";
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        arcDrop.createDrop(p);
        vm.stopPrank();
    }

    function test_CreateDrop_EmptyName_Reverts() public {
        vm.startPrank(creator);
        token.approve(address(arcDrop), 1e18);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = 1e18;
        p.amountPerClaim = 1e18;
        p.name           = "";              // empty name
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        arcDrop.createDrop(p);
        vm.stopPrank();
    }

    function test_CreateDrop_AllowlistMissingMerkleRoot_Reverts() public {
        vm.startPrank(creator);
        token.approve(address(arcDrop), 1e18);
        ArcDrop.CreateDropParams memory p;
        p.dropType    = ArcDrop.DropType.GATED;
        p.gatingType  = ArcDrop.GatingType.ALLOWLIST;
        p.totalAmount = 1e18;
        p.maxClaims   = 1;
        p.merkleRoot  = bytes32(0);         // missing root
        p.name        = "bad";
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        arcDrop.createDrop(p);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Duplicate recipients — same address in allowlist claimed only once
    // ─────────────────────────────────────────────────────────────────────────

    function test_DuplicateRecipient_OnChainGuard() public {
        // The tree has alice listed twice — the off-chain dedup is caller's job,
        // but on-chain hasClaimed still prevents a second claim regardless.
        uint256 amtAlice1 = 100e18;
        uint256 amtAlice2 = 50e18;          // "second" entry with different amount

        // Build a 2-leaf tree: alice with amt1, alice with amt2
        bytes32 leaf0 = keccak256(abi.encodePacked(alice, amtAlice1));
        bytes32 leaf1 = keccak256(abi.encodePacked(alice, amtAlice2));
        bytes32 root  = leaf0 <= leaf1
            ? keccak256(abi.encodePacked(leaf0, leaf1))
            : keccak256(abi.encodePacked(leaf1, leaf0));

        bytes32[] memory proof0 = new bytes32[](1);
        proof0[0] = leaf1;

        uint256 dropId = _createAllowlistDrop(amtAlice1 + amtAlice2, 4, root, address(token));

        // First claim succeeds
        vm.prank(alice);
        arcDrop.claim(dropId, proof0, amtAlice1);
        assertTrue(arcDrop.hasClaimed(dropId, alice));

        // Second claim (different proof, same alice) must revert — already claimed
        bytes32[] memory proof1 = new bytes32[](1);
        proof1[0] = leaf0;

        vm.prank(alice);
        vm.expectRevert(ArcDrop.AlreadyClaimed.selector);
        arcDrop.claim(dropId, proof1, amtAlice2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Maximum claim limits — drop exactly hits maxClaims, next reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_MaxClaims_ExactlyHit_ThenReverts() public {
        uint256 perClaim = 100e18;
        uint256 maxC     = 3;
        uint256 total    = perClaim * maxC;

        uint256 dropId = _createPublicDrop(total, perClaim, maxC, 0);

        // 3 claimants succeed
        vm.prank(alice); arcDrop.claim(dropId, new bytes32[](0), 0);
        vm.prank(bob);   arcDrop.claim(dropId, new bytes32[](0), 0);
        vm.prank(carol); arcDrop.claim(dropId, new bytes32[](0), 0);

        assertEq(arcDrop.getDrop(dropId).claimedCount, maxC, "maxClaims reached");

        // 4th claim hits InsufficientFunds (maxClaims check fires first in _resolveClaimAmount)
        vm.prank(dave);
        vm.expectRevert(ArcDrop.InsufficientFunds.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. MYSTERY drop — payout is within [minAmount, maxAmount]
    // ─────────────────────────────────────────────────────────────────────────

    function test_MysteryDrop_PayoutWithinBounds() public {
        uint256 minAmt   = 10e18;
        uint256 maxAmt   = 50e18;
        uint256 maxClaims = 10;
        uint256 total    = maxAmt * maxClaims;  // worst case all max
        bytes32 secret   = keccak256("mystery-secret");

        vm.startPrank(creator);
        token.approve(address(arcDrop), total);
        ArcDrop.CreateDropParams memory p;
        p.dropType      = ArcDrop.DropType.MYSTERY;
        p.gatingType    = ArcDrop.GatingType.NONE;
        p.totalAmount   = total;
        p.minAmount     = minAmt;
        p.maxAmount     = maxAmt;
        p.maxClaims     = maxClaims;
        p.mysterySecret = secret;
        p.name          = "Mystery Drop";
        uint256 dropId  = arcDrop.createDrop(p);
        vm.stopPrank();

        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        uint256 received = token.balanceOf(alice) - aliceBefore;
        // received = net = gross - fee; gross is in [minAmt, maxAmt]
        uint256 minNet = minAmt - (minAmt * FEE_BPS) / 10_000;
        uint256 maxNet = maxAmt - (maxAmt * FEE_BPS) / 10_000;

        assertGe(received, minNet, "mystery payout >= minNet");
        assertLe(received, maxNet, "mystery payout <= maxNet");
    }

    function test_MysteryDrop_MultipleClaimants_AllWithinBounds() public {
        uint256 minAmt    = 5e18;
        uint256 maxAmt    = 20e18;
        uint256 maxClaims = 5;
        uint256 total     = maxAmt * maxClaims;
        bytes32 secret    = keccak256("another-secret");

        vm.startPrank(creator);
        token.approve(address(arcDrop), total);
        ArcDrop.CreateDropParams memory p;
        p.dropType      = ArcDrop.DropType.MYSTERY;
        p.gatingType    = ArcDrop.GatingType.NONE;
        p.totalAmount   = total;
        p.minAmount     = minAmt;
        p.maxAmount     = maxAmt;
        p.maxClaims     = maxClaims;
        p.mysterySecret = secret;
        p.name          = "Mystery Multi";
        uint256 dropId  = arcDrop.createDrop(p);
        vm.stopPrank();

        address[5] memory claimants = [alice, bob, carol, dave, eve];
        for (uint256 i = 0; i < 5; i++) {
            uint256 before = token.balanceOf(claimants[i]);
            vm.prank(claimants[i]);
            arcDrop.claim(dropId, new bytes32[](0), 0);
            uint256 got = token.balanceOf(claimants[i]) - before;

            uint256 minNet = minAmt - (minAmt * FEE_BPS) / 10_000;
            uint256 maxNet = maxAmt - (maxAmt * FEE_BPS) / 10_000;
            assertGe(got, minNet, "mystery: got >= minNet");
            assertLe(got, maxNet, "mystery: got <= maxNet");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. Refund — creator can refund, non-creator cannot
    // ─────────────────────────────────────────────────────────────────────────

    function test_Refund_Creator_Succeeds() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        // One claim first so totalClaimed > 0
        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        uint256 creatorBefore = token.balanceOf(creator);
        ArcDrop.Drop memory d = arcDrop.getDrop(dropId);
        uint256 unclaimed = d.totalAmount - d.totalClaimed;

        vm.prank(creator);
        arcDrop.refund(dropId);

        assertEq(token.balanceOf(creator), creatorBefore + unclaimed, "creator received unclaimed");
        assertTrue(arcDrop.getDrop(dropId).refunded, "refunded flag set");
    }

    function test_Refund_EmitsEvents() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        ArcDrop.Drop memory d = arcDrop.getDrop(dropId);
        uint256 unclaimed = d.totalAmount - d.totalClaimed;

        // Before expiry → EarlyRefund + Refunded both emitted
        vm.expectEmit(true, true, false, true, address(arcDrop));
        emit ArcDrop.EarlyRefund(dropId, creator, unclaimed);

        vm.expectEmit(true, true, false, true, address(arcDrop));
        emit ArcDrop.Refunded(dropId, creator, unclaimed);

        vm.prank(creator);
        arcDrop.refund(dropId);
    }

    function test_Refund_NonCreator_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.NotCreator.selector);
        arcDrop.refund(dropId);
    }

    function test_Refund_AfterExpiry_NoEarlyRefundEvent() public {
        uint256 expiry = block.timestamp + 1 days;
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, expiry);

        vm.warp(expiry + 1);

        uint256 unclaimed = TOTAL_AMOUNT; // no claims yet

        // Only Refunded emitted (not EarlyRefund since expired)
        vm.expectEmit(true, true, false, true, address(arcDrop));
        emit ArcDrop.Refunded(dropId, creator, unclaimed);

        vm.prank(creator);
        arcDrop.refund(dropId);
    }

    function test_Refund_DoubleRefund_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.refund(dropId);

        vm.prank(creator);
        vm.expectRevert(ArcDrop.AlreadyRefunded.selector);
        arcDrop.refund(dropId);
    }

    function test_Refund_AfterAllClaimed_Reverts() public {
        // totalAmount = 1 × amountPerClaim → exactly 1 slot
        uint256 perClaim = 100e18;
        uint256 dropId   = _createPublicDrop(perClaim, perClaim, 1, 0);

        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        // totalClaimed == totalAmount → unclaimedAmount == 0 → DropNotRefundable
        vm.prank(creator);
        vm.expectRevert(ArcDrop.DropNotRefundable.selector);
        arcDrop.refund(dropId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. Pause / unpause
    // ─────────────────────────────────────────────────────────────────────────

    function test_PauseDrop_ClaimReverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.pauseDrop(dropId);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.DropIsPaused.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    function test_PauseDrop_EmitsPaused() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.expectEmit(true, false, false, false, address(arcDrop));
        emit ArcDrop.DropPaused(dropId);

        vm.prank(creator);
        arcDrop.pauseDrop(dropId);
    }

    function test_UnpauseDrop_ClaimSucceeds() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.pauseDrop(dropId);

        vm.prank(creator);
        arcDrop.unpauseDrop(dropId);

        // Claim should now succeed
        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        assertTrue(arcDrop.hasClaimed(dropId, alice), "claim succeeded after unpause");
    }

    function test_UnpauseDrop_EmitsUnpaused() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.pauseDrop(dropId);

        vm.expectEmit(true, false, false, false, address(arcDrop));
        emit ArcDrop.DropUnpaused(dropId);

        vm.prank(creator);
        arcDrop.unpauseDrop(dropId);
    }

    function test_PauseDrop_NonCreator_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.NotCreator.selector);
        arcDrop.pauseDrop(dropId);
    }

    function test_UnpauseDrop_NonCreator_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.pauseDrop(dropId);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.NotCreator.selector);
        arcDrop.unpauseDrop(dropId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: Constructor validation
    // ─────────────────────────────────────────────────────────────────────────

    function test_Constructor_ZeroUsdc_Reverts() public {
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        new ArcDrop(address(0), feeRecipient, FEE_BPS, owner);
    }

    function test_Constructor_ZeroFeeRecipient_Reverts() public {
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        new ArcDrop(address(usdc), address(0), FEE_BPS, owner);
    }

    function test_Constructor_FeeTooHigh_Reverts() public {
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        new ArcDrop(address(usdc), feeRecipient, 501, owner);   // > 500 bps
    }

    function test_Constructor_Initialization() public view {
        assertEq(arcDrop.usdc(),           address(usdc),    "usdc address");
        assertEq(arcDrop.feeRecipient(),   feeRecipient,     "fee recipient");
        assertEq(arcDrop.platformFeeBps(), FEE_BPS,          "fee bps");
        assertEq(arcDrop.owner(),          owner,            "owner");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: setFee (owner-only)
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetFee_Owner_Succeeds() public {
        address newRecipient = makeAddr("newRecipient");
        uint256 newFee       = 200;

        vm.expectEmit(false, false, false, true, address(arcDrop));
        emit ArcDrop.FeeUpdated(newFee, newRecipient);

        vm.prank(owner);
        arcDrop.setFee(newFee, newRecipient);

        assertEq(arcDrop.platformFeeBps(), newFee,        "new fee bps");
        assertEq(arcDrop.feeRecipient(),   newRecipient,  "new fee recipient");
    }

    function test_SetFee_NonOwner_Reverts() public {
        vm.prank(alice);
        vm.expectRevert();  // OwnableUnauthorizedAccount
        arcDrop.setFee(200, feeRecipient);
    }

    function test_SetFee_TooHighBps_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(ArcDrop.InvalidParams.selector);
        arcDrop.setFee(501, feeRecipient);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: DropNotFound for invalid dropId
    // ─────────────────────────────────────────────────────────────────────────

    function test_Claim_InvalidDropId_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(ArcDrop.DropNotFound.selector);
        arcDrop.claim(9999, new bytes32[](0), 0);
    }

    function test_GetDrop_InvalidDropId_Reverts() public {
        vm.expectRevert(ArcDrop.DropNotFound.selector);
        arcDrop.getDrop(9999);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: Claim on refunded drop
    // ─────────────────────────────────────────────────────────────────────────

    function test_ClaimAfterRefund_Reverts() public {
        uint256 dropId = _createPublicDrop(TOTAL_AMOUNT, AMOUNT_PER_CLAIM, 0, 0);

        vm.prank(creator);
        arcDrop.refund(dropId);

        vm.prank(alice);
        vm.expectRevert(ArcDrop.DropNotRefundable.selector);
        arcDrop.claim(dropId, new bytes32[](0), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: createDrop — default USDC token (address(0) in params)
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateDrop_DefaultToken_UsesUsdc() public {
        vm.startPrank(creator);
        usdc.approve(address(arcDrop), USDC_TOTAL);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = USDC_TOTAL;
        p.amountPerClaim = USDC_PER_CLAIM;
        p.name           = "USDC Default";
        uint256 dropId   = arcDrop.createDrop(p);
        vm.stopPrank();

        ArcDrop.Drop memory d = arcDrop.getDrop(dropId);
        assertEq(arcDrop.usdc(), address(usdc), "usdc address correct");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: DropCreated event
    // ─────────────────────────────────────────────────────────────────────────

    function test_CreateDrop_EmitsDropCreated() public {
        vm.startPrank(creator);
        token.approve(address(arcDrop), TOTAL_AMOUNT);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = TOTAL_AMOUNT;
        p.amountPerClaim = AMOUNT_PER_CLAIM;
        p.name           = "Event Test";

        vm.expectEmit(true, true, true, true, address(arcDrop));
        emit ArcDrop.DropCreated(1, creator, ArcDrop.DropType.PUBLIC, TOTAL_AMOUNT, 0);

        arcDrop.createDrop(p);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: fee arithmetic never loses tokens (net + fee == gross)
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_FeeArithmetic_Conservation(uint256 grossAmount, uint256 feeBps) public view {
        grossAmount = bound(grossAmount, 1, 1e36);
        feeBps      = bound(feeBps, 0, 500);

        uint256 fee = (grossAmount * feeBps) / 10_000;
        uint256 net = grossAmount - fee;

        // net + fee should always equal grossAmount (no double-spend, no loss)
        assertEq(net + fee, grossAmount, "net + fee conservation");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz: PUBLIC drop — any valid amount/claim configuration
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_PublicDrop_ClaimAmount(uint256 perClaim, uint256 multiplier) public {
        perClaim   = bound(perClaim,   1, 1e24);
        multiplier = bound(multiplier, 1, 5);
        uint256 total = perClaim * multiplier;

        token.mint(creator, total);

        vm.startPrank(creator);
        token.approve(address(arcDrop), total);
        ArcDrop.CreateDropParams memory p;
        p.dropType       = ArcDrop.DropType.PUBLIC;
        p.gatingType     = ArcDrop.GatingType.NONE;
        p.totalAmount    = total;
        p.amountPerClaim = perClaim;
        p.name           = "Fuzz Drop";
        uint256 dropId   = arcDrop.createDrop(p);
        vm.stopPrank();

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        arcDrop.claim(dropId, new bytes32[](0), 0);

        uint256 fee = (perClaim * FEE_BPS) / 10_000;
        uint256 net = perClaim - fee;

        assertEq(token.balanceOf(alice) - before, net, "fuzz: alice received net");
    }
}
