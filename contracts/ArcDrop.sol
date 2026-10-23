// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ArcDrop
/// @notice USDC airdrop contract for Arc — supports public, mystery, and gated drop types.
///
///         All drops use USDC as the single token.  GATED + ALLOWLIST drops support
///         per-recipient amounts validated via Merkle proof.
///
///         Merkle leaf encoding for ALLOWLIST drops:
///           leaf = keccak256(abi.encodePacked(recipient, amount))
///         so each address has an individually assigned allocation that cannot be
///         tampered with — a wrong amount produces a different leaf and fails on-chain.
///
///         PUBLIC and MYSTERY drops pass amount = 0 and empty proof (ignored).
contract ArcDrop is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Enumerations ─────────────────────────────────────────────────────────

    enum DropType {
        PUBLIC,   // fixed amount per claim, open to anyone up to maxClaims
        MYSTERY,  // random amount between min and max, slot pre-determined by secret
        GATED     // gating required; ALLOWLIST sub-type carries per-recipient amounts
    }

    enum GatingType {
        NONE,         // open to anyone (subject to maxClaims)
        ALLOWLIST,    // Merkle proof required; leaf = keccak256(address, amount)
        NFT_HOLDER,   // must hold ≥ 1 NFT from gatingContract
        TOKEN_HOLDER  // must hold ≥ gatingMinBalance of gatingContract
    }

    // ── Structs ───────────────────────────────────────────────────────────────

    struct Drop {
        address creator;
        DropType dropType;
        GatingType gatingType;
        uint256 totalAmount;      // USDC deposited at creation (6 decimals)
        uint256 amountPerClaim;   // fixed payout: PUBLIC / GATED non-ALLOWLIST
        uint256 minAmount;        // MYSTERY lower bound
        uint256 maxAmount;        // MYSTERY upper bound
        uint256 maxClaims;        // max unique wallets (0 = unlimited for PUBLIC)
        uint256 claimedCount;     // wallets that have claimed so far
        uint256 totalClaimed;     // USDC paid out so far
        uint256 expiresAt;        // unix timestamp; 0 = never expires
        bool paused;
        bool refunded;
        bytes32 merkleRoot;       // root of (address, amount) tree for ALLOWLIST drops
        address gatingContract;   // NFT/token contract address for holder gating
        uint256 gatingMinBalance; // minimum balance for TOKEN_HOLDER gating
        bytes32 mysterySecret;    // entropy source for MYSTERY slot payouts
        string name;
        string metadataUri;
    }

    struct CreateDropParams {
        DropType dropType;
        GatingType gatingType;
        uint256 totalAmount;
        uint256 amountPerClaim;   // ignored for ALLOWLIST gated drops
        uint256 minAmount;
        uint256 maxAmount;
        uint256 maxClaims;
        uint256 expiresAt;
        bytes32 merkleRoot;
        address gatingContract;
        uint256 gatingMinBalance;
        bytes32 mysterySecret;
        string name;
        string metadataUri;
    }

    // ── Errors ────────────────────────────────────────────────────────────────

    error DropNotFound();
    error AlreadyClaimed();
    error DropExpired();
    error DropIsPaused();
    error InvalidProof();
    error GatingFailed();
    error InsufficientFunds();
    error InvalidParams();
    error NotCreator();
    error AlreadyRefunded();
    error DropNotRefundable();

    // ── Events ────────────────────────────────────────────────────────────────

    event DropCreated(
        uint256 indexed dropId,
        address indexed creator,
        DropType dropType,
        uint256 totalAmount,
        uint256 expiresAt
    );
    event Claimed(
        uint256 indexed dropId,
        address indexed claimer,
        uint256 netAmount,
        uint256 grossAmount
    );
    event Refunded(uint256 indexed dropId, address indexed creator, uint256 amount);
    event EarlyRefund(uint256 indexed dropId, address indexed creator, uint256 amount);
    event DropPaused(uint256 indexed dropId);
    event DropUnpaused(uint256 indexed dropId);
    event FeeUpdated(uint256 feeBps, address recipient);

    // ── State ─────────────────────────────────────────────────────────────────

    mapping(uint256 => Drop) public drops;
    uint256 public dropCount;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    /// @notice USDC token address on this chain (immutable).
    address public immutable usdc;

    /// @notice Platform fee in basis points (100 bps = 1%). Max 5%.
    uint256 public platformFeeBps;

    /// @notice Address that receives platform fees.
    address public feeRecipient;

    uint256 public constant MAX_FEE_BPS = 500;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _usdc         USDC token address on this chain.
    /// @param _feeRecipient Address receiving platform fees.
    /// @param _feeBps       Initial fee in basis points (0–500).
    /// @param initialOwner  Contract owner (Ownable).
    constructor(
        address _usdc,
        address _feeRecipient,
        uint256 _feeBps,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_usdc == address(0) || _feeRecipient == address(0) || _feeBps > MAX_FEE_BPS) {
            revert InvalidParams();
        }
        usdc = _usdc;
        feeRecipient = _feeRecipient;
        platformFeeBps = _feeBps;
    }

    // ── External — mutating ───────────────────────────────────────────────────

    /// @notice Create and fund a new USDC drop.
    ///         Caller must approve totalAmount USDC to this contract first.
    function createDrop(CreateDropParams calldata params) external returns (uint256 dropId) {
        if (params.totalAmount == 0) revert InvalidParams();
        if (bytes(params.name).length == 0) revert InvalidParams();
        if (params.expiresAt != 0 && params.expiresAt <= block.timestamp) revert InvalidParams();

        _validateDropTypeParams(params);
        _validateGatingParams(params);

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), params.totalAmount);

        dropId = ++dropCount;
        _initDrop(drops[dropId], params, msg.sender);

        emit DropCreated(dropId, msg.sender, params.dropType, params.totalAmount, params.expiresAt);
    }

    /// @notice Claim USDC from a drop.
    ///
    ///   PUBLIC / MYSTERY drops  — pass merkleProof = [] and amount = 0.
    ///   ALLOWLIST gated drops   — pass the recipient's Merkle proof and their
    ///                             individually assigned amount.
    ///   NFT / TOKEN gated drops — pass merkleProof = [] and amount = 0.
    ///
    /// @param dropId      Target drop id.
    /// @param merkleProof Proof for ALLOWLIST gating (empty for other types).
    /// @param amount      Per-recipient amount for ALLOWLIST drops (0 otherwise).
    function claim(
        uint256 dropId,
        bytes32[] calldata merkleProof,
        uint256 amount
    ) external nonReentrant {
        Drop storage drop = _getDrop(dropId);

        if (drop.paused)   revert DropIsPaused();
        if (drop.refunded) revert DropNotRefundable();
        if (drop.expiresAt != 0 && block.timestamp >= drop.expiresAt) revert DropExpired();
        if (hasClaimed[dropId][msg.sender]) revert AlreadyClaimed();

        _enforceGating(drop, msg.sender, merkleProof, amount);

        uint256 claimAmount = _resolveClaimAmount(drop, amount);

        hasClaimed[dropId][msg.sender] = true;
        unchecked { drop.claimedCount += 1; }
        drop.totalClaimed += claimAmount;

        uint256 feeAmount = (claimAmount * platformFeeBps) / 10_000;
        uint256 netAmount = claimAmount - feeAmount;

        IERC20(usdc).safeTransfer(msg.sender, netAmount);
        if (feeAmount > 0) {
            IERC20(usdc).safeTransfer(feeRecipient, feeAmount);
        }

        emit Claimed(dropId, msg.sender, netAmount, claimAmount);
    }

    /// @notice Refund all unclaimed USDC to the creator.
    function refund(uint256 dropId) external nonReentrant {
        Drop storage drop = _getDrop(dropId);
        if (msg.sender != drop.creator) revert NotCreator();
        if (drop.refunded) revert AlreadyRefunded();

        uint256 unclaimed = drop.totalAmount - drop.totalClaimed;
        if (unclaimed == 0) revert DropNotRefundable();

        bool expired = drop.expiresAt != 0 && block.timestamp >= drop.expiresAt;
        drop.refunded = true;

        IERC20(usdc).safeTransfer(drop.creator, unclaimed);

        if (!expired) emit EarlyRefund(dropId, drop.creator, unclaimed);
        emit Refunded(dropId, drop.creator, unclaimed);
    }

    /// @notice Pause claiming (creator only).
    function pauseDrop(uint256 dropId) external {
        Drop storage drop = _getDrop(dropId);
        if (msg.sender != drop.creator) revert NotCreator();
        drop.paused = true;
        emit DropPaused(dropId);
    }

    /// @notice Unpause claiming (creator only).
    function unpauseDrop(uint256 dropId) external {
        Drop storage drop = _getDrop(dropId);
        if (msg.sender != drop.creator) revert NotCreator();
        drop.paused = false;
        emit DropUnpaused(dropId);
    }

    /// @notice Update platform fee (owner only).
    function setFee(uint256 feeBps, address recipient) external onlyOwner {
        if (feeBps > MAX_FEE_BPS || recipient == address(0)) revert InvalidParams();
        platformFeeBps = feeBps;
        feeRecipient = recipient;
        emit FeeUpdated(feeBps, recipient);
    }

    // ── External — view ───────────────────────────────────────────────────────

    function getDrop(uint256 dropId) external view returns (Drop memory) {
        return _getDrop(dropId);
    }

    /// @notice Preview claimable USDC for a wallet.
    ///         Returns 0 for ALLOWLIST drops (amount comes from off-chain manifest).
    function getClaimableAmount(uint256 dropId, address claimer) external view returns (uint256) {
        Drop storage drop = drops[dropId];
        if (drop.creator == address(0)) return 0;
        if (drop.paused || drop.refunded || hasClaimed[dropId][claimer]) return 0;
        if (drop.expiresAt != 0 && block.timestamp >= drop.expiresAt) return 0;

        if (drop.dropType == DropType.PUBLIC) {
            if (drop.maxClaims > 0 && drop.claimedCount >= drop.maxClaims) return 0;
            if (drop.totalClaimed + drop.amountPerClaim > drop.totalAmount) return 0;
            return drop.amountPerClaim;
        }

        if (drop.dropType == DropType.GATED) {
            if (drop.gatingType == GatingType.ALLOWLIST) return 0;
            if (drop.claimedCount >= drop.maxClaims) return 0;
            if (drop.totalClaimed + drop.amountPerClaim > drop.totalAmount) return 0;
            return drop.amountPerClaim;
        }

        // MYSTERY
        if (drop.claimedCount >= drop.maxClaims) return 0;
        if (drop.totalClaimed + drop.minAmount > drop.totalAmount) return 0;
        return drop.minAmount + ((drop.maxAmount - drop.minAmount) / 2);
    }

    /// @notice Verify an ALLOWLIST proof without sending a transaction.
    function verifyProof(
        uint256 dropId,
        address recipient,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        Drop storage drop = drops[dropId];
        if (drop.creator == address(0)) return false;
        if (drop.gatingType != GatingType.ALLOWLIST) return false;
        bytes32 leaf = keccak256(abi.encodePacked(recipient, amount));
        return _verifyMerkleProof(proof, drop.merkleRoot, leaf);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _getDrop(uint256 dropId) internal view returns (Drop storage drop) {
        drop = drops[dropId];
        if (drop.creator == address(0)) revert DropNotFound();
    }

    function _validateDropTypeParams(CreateDropParams calldata params) internal pure {
        if (params.dropType == DropType.PUBLIC) {
            if (params.amountPerClaim == 0 || params.amountPerClaim > params.totalAmount)
                revert InvalidParams();
            return;
        }
        if (params.dropType == DropType.MYSTERY) {
            if (
                params.minAmount == 0
                || params.maxAmount < params.minAmount
                || params.maxAmount > params.totalAmount
                || params.maxClaims == 0
                || params.mysterySecret == bytes32(0)
            ) revert InvalidParams();
            return;
        }
        // GATED: ALLOWLIST uses per-recipient amounts from the tree so amountPerClaim is unused
        if (params.gatingType != GatingType.ALLOWLIST) {
            if (params.maxClaims == 0 || params.amountPerClaim == 0) revert InvalidParams();
        } else {
            if (params.maxClaims == 0) revert InvalidParams();
        }
    }

    function _validateGatingParams(CreateDropParams calldata params) internal pure {
        if (params.gatingType == GatingType.ALLOWLIST) {
            if (params.merkleRoot == bytes32(0)) revert InvalidParams();
            return;
        }
        if (params.gatingType == GatingType.NFT_HOLDER) {
            if (params.gatingContract == address(0)) revert InvalidParams();
            return;
        }
        if (params.gatingType == GatingType.TOKEN_HOLDER) {
            if (params.gatingContract == address(0) || params.gatingMinBalance == 0)
                revert InvalidParams();
        }
    }

    function _initDrop(
        Drop storage drop,
        CreateDropParams calldata params,
        address creator
    ) internal {
        drop.creator          = creator;
        drop.dropType         = params.dropType;
        drop.gatingType       = params.gatingType;
        drop.totalAmount      = params.totalAmount;
        drop.amountPerClaim   = params.amountPerClaim;
        drop.minAmount        = params.minAmount;
        drop.maxAmount        = params.maxAmount;
        drop.maxClaims        = params.maxClaims;
        drop.expiresAt        = params.expiresAt;
        drop.merkleRoot       = params.merkleRoot;
        drop.gatingContract   = params.gatingContract;
        drop.gatingMinBalance = params.gatingMinBalance;
        drop.mysterySecret    = params.mysterySecret;
        drop.name             = params.name;
        drop.metadataUri      = params.metadataUri;
    }

    function _resolveClaimAmount(
        Drop storage drop,
        uint256 manifestAmount
    ) internal view returns (uint256 claimAmount) {
        if (drop.dropType == DropType.PUBLIC) {
            if (drop.maxClaims > 0 && drop.claimedCount >= drop.maxClaims)
                revert InsufficientFunds();
            claimAmount = drop.amountPerClaim;
        } else if (drop.dropType == DropType.MYSTERY) {
            if (drop.claimedCount >= drop.maxClaims) revert InsufficientFunds();
            claimAmount = _computeMysteryAmount(
                drop.mysterySecret, drop.claimedCount, drop.minAmount, drop.maxAmount
            );
        } else {
            // GATED
            if (drop.claimedCount >= drop.maxClaims) revert InsufficientFunds();
            claimAmount = drop.gatingType == GatingType.ALLOWLIST
                ? manifestAmount   // already verified by _enforceGating
                : drop.amountPerClaim;
        }
        if (drop.totalClaimed + claimAmount > drop.totalAmount) revert InsufficientFunds();
    }

    function _computeMysteryAmount(
        bytes32 secret,
        uint256 slotIndex,
        uint256 minAmt,
        uint256 maxAmt
    ) internal pure returns (uint256) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(secret, slotIndex)));
        return minAmt + (entropy % (maxAmt - minAmt + 1));
    }

    function _enforceGating(
        Drop storage drop,
        address claimer,
        bytes32[] calldata merkleProof,
        uint256 amount
    ) internal view {
        if (drop.gatingType == GatingType.NONE) return;

        if (drop.gatingType == GatingType.ALLOWLIST) {
            bytes32 leaf = keccak256(abi.encodePacked(claimer, amount));
            if (!_verifyMerkleProof(merkleProof, drop.merkleRoot, leaf)) revert InvalidProof();
            return;
        }

        uint256 bal = IERC20(drop.gatingContract).balanceOf(claimer);
        if (drop.gatingType == GatingType.NFT_HOLDER) {
            if (bal < 1) revert GatingFailed();
            return;
        }
        if (bal < drop.gatingMinBalance) revert GatingFailed();
    }

    function _verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            bytes32 el = proof[i];
            computed = computed <= el
                ? keccak256(abi.encodePacked(computed, el))
                : keccak256(abi.encodePacked(el, computed));
        }
        return computed == root;
    }
}
