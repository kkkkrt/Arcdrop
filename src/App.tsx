import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import Dashboard from './components/Dashboard'
import ClaimPage from './components/ClaimPage'
import ConfigGuard from './components/ConfigGuard'
import AboutPage from './components/AboutPage'
import { useNetwork } from './NetworkContext'

type View = 'dashboard' | 'claim' | 'about'

function getInitialDrop(): bigint | null {
  const params = new URLSearchParams(window.location.search)
  const drop = params.get('drop')
  return drop ? BigInt(drop) : null
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

export default function App() {
  const [claimDropId, setClaimDropId] = useState<bigint | null>(getInitialDrop)
  const [view, setView] = useState<View>(getInitialDrop() !== null ? 'claim' : 'dashboard')
  const { network, config: netConfig, toggle: toggleNetwork } = useNetwork()
  const { isConnected, chainId: walletChainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const onWrongChain = isConnected && walletChainId !== netConfig.chainId

  const handleSwitchChain = () => {
    switchChain({ chainId: netConfig.chainId })
  }

  const goToClaim = (dropId: bigint) => {
    setClaimDropId(dropId)
    setView('claim')
    window.history.pushState({}, '', `?drop=${dropId}`)
  }

  const goToDashboard = () => {
    setView('dashboard')
    setClaimDropId(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  const goToAbout = () => {
    setView('about')
    setClaimDropId(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: 'absolute', top: '-5%', left: '-10%',
          width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 65%)',
          filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '-8%',
          width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(175,143,244,0.14) 0%, transparent 65%)',
          filter: 'blur(72px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-5%', left: '30%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,205,131,0.18) 0%, transparent 65%)',
          filter: 'blur(76px)',
        }} />
      </div>

      {/* Header — z-[60] keeps it above the ConfigGuard overlay (z-50) */}
      <header className="relative z-[60] mx-auto max-w-3xl px-5 py-4">
        <div
          className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.70)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.72)',
            boxShadow: '0 2px 16px rgba(18,45,69,0.06)',
          }}
        >
          <div className="flex items-center gap-3">
            <button onClick={goToDashboard} className="flex items-center gap-2.5 focus:outline-none">
              {/* Logo mark */}
              <div
                className="relative flex items-center justify-center w-8 h-8 rounded-xl overflow-hidden"
                style={{ background: 'var(--accent)' }}
              >
                <div
                  className="absolute inset-0 opacity-30"
                  style={{ background: spectral }}
                />
                <span className="relative z-10 text-white font-black text-xs tracking-tight">AD</span>
              </div>
              <span className="display text-base font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
                ArcDrop
              </span>
            </button>
            <button
              onClick={goToAbout}
              className="hidden sm:block text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{
                color: view === 'about' ? 'var(--accent)' : 'var(--subtle)',
                background: view === 'about' ? 'rgba(18,45,69,0.08)' : 'transparent',
              }}
            >
              About
            </button>
          </div>

          <div className="flex items-center gap-2">

            {/* In-app Testnet / Mainnet toggle — always visible */}
            <button
              onClick={toggleNetwork}
              className="flex items-center rounded-xl text-xs font-bold overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.97]"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface-muted)',
              }}
              title="Switch between Testnet and Mainnet"
            >
              {(['testnet', 'mainnet'] as const).map(n => (
                <span
                  key={n}
                  className="px-2.5 py-1.5 transition-colors"
                  style={network === n ? {
                    background: n === 'mainnet' ? 'rgba(26,128,71,0.15)' : 'rgba(18,45,69,0.12)',
                    color: n === 'mainnet' ? 'var(--success)' : 'var(--accent)',
                  } : {
                    color: 'var(--subtle)',
                  }}
                >
                  {n === 'testnet' ? 'Testnet' : 'Mainnet'}
                </span>
              ))}
            </button>

            {/* MetaMask chain mismatch — dot on wallet button handles this visually */}
            {onWrongChain && (
              <button
                onClick={handleSwitchChain}
                disabled={isSwitching}
                className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: 'rgba(186,43,76,0.10)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(186,43,76,0.22)',
                }}
                title={isSwitching ? 'Switching…' : `Switch wallet to ${netConfig.label}`}
              >
                <AlertTriangle size={12} strokeWidth={2.5} />
              </button>
            )}

            <ConnectKitButton.Custom>
              {({ isConnected: ckConnected, show, address }) => (
                <button
                  onClick={show}
                  className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={ckConnected ? {
                    background: 'var(--surface-muted)',
                    color: 'var(--ink)',
                    border: '1px solid var(--border)',
                  } : {
                    background: 'var(--accent)',
                    color: 'white',
                    boxShadow: '0 2px 12px rgba(18,45,69,0.22)',
                  }}
                >
                  {ckConnected && address ? (
                    <>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: onWrongChain ? 'var(--danger)' : 'var(--success)' }}
                      />
                      {address.slice(0, 6)}…{address.slice(-4)}
                    </>
                  ) : 'Connect Wallet'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        </div>
      </header>

      {/* Main — blocked until contract is configured */}
      <ConfigGuard>
        <main className="relative z-10">
          {view === 'dashboard' && <Dashboard onShareDrop={goToClaim} />}
          {view === 'claim' && claimDropId !== null && (
            <ClaimPage dropId={claimDropId} onBack={goToDashboard} />
          )}
          {view === 'about' && <AboutPage onBack={goToDashboard} />}
        </main>
      </ConfigGuard>
    </div>
  )
}
