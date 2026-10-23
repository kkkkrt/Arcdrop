/**
 * NetworkContext — runtime testnet/mainnet toggle stored in localStorage.
 *
 * Use `useNetwork()` anywhere to get the active network config and a toggle fn.
 * The env-var static config in contract-config.ts sets the DEFAULT; the user
 * can override it in the UI without touching .env or reloading.
 */

import { createContext, useContext, useState, useCallback } from 'react'
import { ARC_TESTNET, ARC_MAINNET, type NetworkConfig } from './contract-config'

const STORAGE_KEY = 'arcdrop_network'

// Addresses for both networks (always embedded — mainnet shows "not deployed" if missing)
function env(key: string): string {
  return ((import.meta.env as Record<string, string | undefined>)[key] ?? '').trim()
}

export const TESTNET_ADDRESS = (
  env('VITE_ARCDROP_TESTNET_ADDRESS') ||
  env('NEXT_PUBLIC_ARCDROP_TESTNET_ADDRESS') ||
  env('VITE_ARCDROP_CONTRACT_ADDRESS') ||
  env('NEXT_PUBLIC_ARCDROP_CONTRACT_ADDRESS') ||
  env('VITE_ARC_DROP_ADDRESS') ||
  ''
) as `0x${string}`

export const MAINNET_ADDRESS = (
  env('VITE_ARCDROP_MAINNET_ADDRESS') ||
  env('NEXT_PUBLIC_ARCDROP_MAINNET_ADDRESS') ||
  ''
) as `0x${string}`

function isValidAddress(a: string): a is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(a)
}

type NetworkKey = 'testnet' | 'mainnet'

function readStoredNetwork(): NetworkKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'mainnet' || v === 'testnet') return v
  } catch { /* ignore */ }
  // default from env var
  return env('VITE_ARC_NETWORK').toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet'
}

interface NetworkCtx {
  network: NetworkKey
  config: NetworkConfig
  contractAddress: `0x${string}`
  contractOk: boolean
  toggle: () => void
}

const Ctx = createContext<NetworkCtx | null>(null)

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<NetworkKey>(readStoredNetwork)

  const toggle = useCallback(() => {
    setNetwork(prev => {
      const next: NetworkKey = prev === 'testnet' ? 'mainnet' : 'testnet'
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
      return next
    })
  }, [])

  const config = network === 'mainnet' ? ARC_MAINNET : ARC_TESTNET
  const contractAddress = (network === 'mainnet' ? MAINNET_ADDRESS : TESTNET_ADDRESS)
  const contractOk = isValidAddress(contractAddress)

  return (
    <Ctx.Provider value={{ network, config, contractAddress, contractOk, toggle }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNetwork() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return ctx
}
