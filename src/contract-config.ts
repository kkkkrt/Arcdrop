/**
 * contract-config.ts
 *
 * Dual-network configuration for ArcDrop — supports Arc Testnet and Arc Mainnet.
 *
 * HOW TO SWITCH NETWORKS
 * ─────────────────────
 * The active network is controlled by a single env var:
 *
 *   VITE_ARC_NETWORK=testnet   ← default (Arc Testnet, chain 5042002)
 *   VITE_ARC_NETWORK=mainnet   ← Arc Mainnet (chain 747)
 *
 * Each network needs its own contract address:
 *
 *   # Testnet
 *   VITE_ARCDROP_TESTNET_ADDRESS=0xYourTestnetContractAddress
 *
 *   # Mainnet (set this only after you deploy to mainnet)
 *   VITE_ARCDROP_MAINNET_ADDRESS=0xYourMainnetContractAddress
 *
 * Legacy keys (still accepted):
 *   NEXT_PUBLIC_ARCDROP_CONTRACT_ADDRESS
 *   VITE_ARCDROP_CONTRACT_ADDRESS
 *   VITE_ARC_DROP_ADDRESS
 *
 * When VITE_ARC_NETWORK is not set, the app defaults to testnet.
 * When VITE_ARC_NETWORK=mainnet but VITE_ARCDROP_MAINNET_ADDRESS is not set,
 * the ConfigGuard banner explains exactly what to do.
 */

// ── Network definitions ───────────────────────────────────────────────────────

export interface NetworkConfig {
  chainId: number
  name: string
  label: string           // shown in the UI
  isMainnet: boolean
  usdcAddress: `0x${string}`
  explorerBase: string
}

export const ARC_TESTNET: NetworkConfig = {
  chainId: 5042002,
  name: 'arc-testnet',
  label: 'Arc Testnet',
  isMainnet: false,
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerBase: 'https://explorer.testnet.arc.io',
}

export const ARC_MAINNET: NetworkConfig = {
  chainId: 5042,
  name: 'arc-mainnet',
  label: 'Arc',
  isMainnet: true,
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerBase: 'https://explorer.arc.io',
}

// ── Read env vars ─────────────────────────────────────────────────────────────

function env(key: string): string {
  return ((import.meta.env as Record<string, string | undefined>)[key] ?? '').trim()
}

const rawNetwork = env('VITE_ARC_NETWORK').toLowerCase()
export const isMainnet = rawNetwork === 'mainnet'
export const ACTIVE_NETWORK: NetworkConfig = isMainnet ? ARC_MAINNET : ARC_TESTNET

// ── Resolve contract address ──────────────────────────────────────────────────

function resolveAddress(): string {
  if (isMainnet) {
    return (
      env('VITE_ARCDROP_MAINNET_ADDRESS') ||
      env('NEXT_PUBLIC_ARCDROP_MAINNET_ADDRESS') ||
      ''
    )
  }
  return (
    env('VITE_ARCDROP_TESTNET_ADDRESS') ||
    env('NEXT_PUBLIC_ARCDROP_TESTNET_ADDRESS') ||
    // legacy keys accepted on testnet
    env('VITE_ARCDROP_CONTRACT_ADDRESS') ||
    env('NEXT_PUBLIC_ARCDROP_CONTRACT_ADDRESS') ||
    env('VITE_ARC_DROP_ADDRESS') ||
    ''
  )
}

const rawAddress = resolveAddress()
const addressValid = /^0x[0-9a-fA-F]{40}$/.test(rawAddress)

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * The validated contract address for the active network.
 * Zero address when not configured — always check contractConfigOk first.
 */
export const ARC_DROP_CONTRACT_ADDRESS: `0x${string}` = addressValid
  ? (rawAddress as `0x${string}`)
  : '0x0000000000000000000000000000000000000000'

/** Chain ID for the active network. */
export const CONFIGURED_CHAIN_ID: number = ACTIVE_NETWORK.chainId

/** USDC address for the active network. */
export const USDC_ADDRESS: `0x${string}` = ACTIVE_NETWORK.usdcAddress

/** True only when the contract address is present and valid. */
export const contractConfigOk: boolean = addressValid

/**
 * Human-readable config errors shown by the ConfigGuard banner.
 * Empty array = all good.
 */
export function getConfigErrors(): string[] {
  const errors: string[] = []

  if (!rawAddress) {
    if (isMainnet) {
      errors.push(
        'Mainnet contract address is not set. ' +
        'Add VITE_ARCDROP_MAINNET_ADDRESS=0xYourAddress to your .env file after deploying to Arc Mainnet (chain 747).',
      )
    } else {
      errors.push(
        'Contract address is not set. ' +
        'Add VITE_ARCDROP_TESTNET_ADDRESS=0xYourAddress to your .env file.',
      )
    }
  } else if (!addressValid) {
    errors.push(
      `"${rawAddress}" is not a valid address (must be 0x followed by 40 hex characters).`,
    )
  }

  if (isMainnet) {
    errors.push(
      'You are running in MAINNET mode (VITE_ARC_NETWORK=mainnet). ' +
      'Transactions involve real USDC. Double-check your contract address before proceeding.',
    )
  }

  return errors
}
