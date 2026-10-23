// Contract address + network config — see src/contract-config.ts
export { ARC_DROP_CONTRACT_ADDRESS as ARC_DROP_ADDRESS, CONFIGURED_CHAIN_ID, USDC_ADDRESS, ACTIVE_NETWORK, isMainnet } from '@/contract-config'

export const ARC_DROP_ABI = [
  // ── Write functions ──────────────────────────────────────────────────────
  {
    name: 'createDrop',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'dropType', type: 'uint8' },
          { name: 'gatingType', type: 'uint8' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'amountPerClaim', type: 'uint256' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'maxClaims', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'merkleRoot', type: 'bytes32' },
          { name: 'gatingContract', type: 'address' },
          { name: 'gatingMinBalance', type: 'uint256' },
          { name: 'mysterySecret', type: 'bytes32' },
          { name: 'name', type: 'string' },
          { name: 'metadataUri', type: 'string' },
        ],
      },
    ],
    outputs: [{ name: 'dropId', type: 'uint256' }],
  },
  // claim — amount = per-recipient USDC for ALLOWLIST drops (0 for others)
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dropId', type: 'uint256' },
      { name: 'merkleProof', type: 'bytes32[]' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'refund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'pauseDrop',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'unpauseDrop',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [],
  },
  // ── View functions ───────────────────────────────────────────────────────
  {
    name: 'getDrop',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'dropId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'dropType', type: 'uint8' },
          { name: 'gatingType', type: 'uint8' },
          { name: 'totalAmount', type: 'uint256' },
          { name: 'amountPerClaim', type: 'uint256' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'maxClaims', type: 'uint256' },
          { name: 'claimedCount', type: 'uint256' },
          { name: 'totalClaimed', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'paused', type: 'bool' },
          { name: 'refunded', type: 'bool' },
          { name: 'merkleRoot', type: 'bytes32' },
          { name: 'gatingContract', type: 'address' },
          { name: 'gatingMinBalance', type: 'uint256' },
          { name: 'mysterySecret', type: 'bytes32' },
          { name: 'name', type: 'string' },
          { name: 'metadataUri', type: 'string' },
        ],
      },
    ],
  },
  {
    name: 'getClaimableAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dropId', type: 'uint256' },
      { name: 'claimer', type: 'address' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    name: 'verifyProof',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dropId', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'hasClaimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'dropCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'usdc',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    name: 'DropCreated',
    type: 'event',
    inputs: [
      { name: 'dropId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'dropType', type: 'uint8', indexed: false },
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'expiresAt', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Claimed',
    type: 'event',
    inputs: [
      { name: 'dropId', type: 'uint256', indexed: true },
      { name: 'claimer', type: 'address', indexed: true },
      { name: 'netAmount', type: 'uint256', indexed: false },
      { name: 'grossAmount', type: 'uint256', indexed: false },
    ],
  },
] as const

export const DROP_TYPE_LABELS = ['Public', 'Mystery', 'Gated'] as const
export const GATING_TYPE_LABELS = ['None', 'Allowlist', 'NFT Holder', 'Token Holder'] as const

// USDC has 6 decimals on all Arc networks
export const USDC_DECIMALS = 6

export interface DropData {
  creator: `0x${string}`
  dropType: number
  gatingType: number
  totalAmount: bigint
  amountPerClaim: bigint
  minAmount: bigint
  maxAmount: bigint
  maxClaims: bigint
  claimedCount: bigint
  totalClaimed: bigint
  expiresAt: bigint
  paused: boolean
  refunded: boolean
  merkleRoot: `0x${string}`
  gatingContract: `0x${string}`
  gatingMinBalance: bigint
  mysterySecret: `0x${string}`
  name: string
  metadataUri: string
}

export function isDropActive(drop: DropData): boolean {
  if (drop.paused || drop.refunded) return false
  if (drop.expiresAt > 0n && BigInt(Math.floor(Date.now() / 1000)) >= drop.expiresAt) return false
  return true
}

export function dropProgress(drop: DropData): number {
  if (drop.totalAmount === 0n) return 0
  return Number((drop.totalClaimed * 100n) / drop.totalAmount)
}
