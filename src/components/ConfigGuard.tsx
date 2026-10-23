/**
 * ConfigGuard
 *
 * Shown at the top of the app when contract configuration is missing or
 * invalid.  When the config is fine it renders nothing.
 *
 * Rules (per project requirements):
 * - Display clear errors when configuration is missing or incorrect.
 * - Do not claim features work until they are verified against the actual
 *   contract.  When the config is broken the banner blocks the main UI
 *   entirely so no contract calls are attempted.
 */
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useNetwork } from '@/NetworkContext'

interface Props {
  children: React.ReactNode
}

export default function ConfigGuard({ children }: Props) {
  const { contractOk, contractAddress, config: netConfig, network } = useNetwork()

  if (contractOk) {
    return <>{children}</>
  }

  const errors: string[] = []
  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    errors.push(
      network === 'mainnet'
        ? `Mainnet contract address is not set. Add VITE_ARCDROP_MAINNET_ADDRESS=0x... to your .env file after deploying to Arc (chain ${netConfig.chainId}).`
        : `Testnet contract address is not set. Add VITE_ARCDROP_TESTNET_ADDRESS=0x... to your .env file.`
    )
  }

  return (
    <>
      {/* Config error overlay — starts below the header (top-[72px]) so the toggle is always reachable */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center p-6"
        style={{ top: '72px', background: 'var(--bg-gradient)' }}
      >
        <div
          className="w-full max-w-lg rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow: '0 16px 60px rgba(18,45,69,0.14)',
          }}
        >
          {/* Warning strip */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, #f05c6b, #ffcd83)' }} />

          <div className="px-6 py-6 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(240,92,107,0.10)' }}
              >
                <AlertTriangle size={20} style={{ color: '#e03050' }} />
              </div>
              <div>
                <h2 className="font-bold text-lg" style={{ color: 'var(--ink)' }}>
                  Contract not configured
                </h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  ArcDrop needs a deployed contract address before any features can be used.
                </p>
              </div>
            </div>

            {/* Error list */}
            <div className="space-y-2">
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 text-sm p-3 rounded-xl"
                  style={{ background: 'rgba(240,92,107,0.07)', color: '#c0283c' }}
                >
                  <span className="mt-0.5 flex-shrink-0 font-bold">!</span>
                  <span>{err}</span>
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div
              className="rounded-xl p-4 space-y-2 text-sm"
              style={{ background: 'rgba(18,45,69,0.05)', color: 'var(--ink-2)' }}
            >
              <p className="font-bold text-xs uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
                How to fix
              </p>
              <ol className="list-decimal list-inside space-y-1.5" style={{ color: 'var(--ink-2)' }}>
                <li>
                  Deploy your ArcDrop contract to{' '}
                  <strong>{netConfig.label} (chain ID {netConfig.chainId})</strong>.
                </li>
                <li>
                  Create or edit <code className="text-xs bg-black/5 px-1 py-0.5 rounded">.env</code> in
                  the project root and add:
                  <pre
                    className="mt-1.5 text-xs p-2.5 rounded-lg overflow-x-auto"
                    style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
                  >
{network === 'mainnet'
  ? `VITE_ARCDROP_MAINNET_ADDRESS=0xYourContractAddress`
  : `VITE_ARCDROP_TESTNET_ADDRESS=0xYourContractAddress`}
                  </pre>
                  <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                    Vite requires env vars to start with <code className="bg-black/5 px-1 py-0.5 rounded">VITE_</code>
                    {' '}to be exposed. Add matching aliases:
                  </p>
                  <pre
                    className="mt-1 text-xs p-2.5 rounded-lg overflow-x-auto"
                    style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
                  >
{network === 'mainnet'
  ? `VITE_ARCDROP_MAINNET_ADDRESS=0xYourContractAddress`
  : `VITE_ARCDROP_TESTNET_ADDRESS=0xYourContractAddress`}
                  </pre>
                </li>
                <li>Restart the dev server after saving <code className="text-xs bg-black/5 px-1 py-0.5 rounded">.env</code>.</li>
              </ol>
            </div>

            {/* Current state debug row */}
            <div
              className="rounded-xl p-3 text-xs space-y-1 font-mono"
              style={{ background: 'rgba(18,45,69,0.04)', color: 'var(--subtle)' }}
            >
              <div>
                <span className="font-sans font-bold not-italic" style={{ color: 'var(--ink-2)' }}>Detected address: </span>
                {!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000'
                  ? <span style={{ color: '#c0283c' }}>not set</span>
                  : <span style={{ color: 'var(--ink)' }}>{contractAddress}</span>}
              </div>
              <div>
                <span className="font-sans font-bold not-italic" style={{ color: 'var(--ink-2)' }}>Chain ID: </span>
                <span style={{ color: 'var(--success)' }}>{netConfig.chainId}</span>
              </div>
            </div>

            {/* Explorer link (only if address looks real) */}
            {contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000' && (
              <a
                href={`${netConfig.explorerBase}/address/${contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                <ExternalLink size={12} />
                View on {netConfig.label} Explorer
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
