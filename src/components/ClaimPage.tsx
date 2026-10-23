import { useState, useEffect, useTransition } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ArrowLeft, ExternalLink, Check, AlertCircle, Clock, Users, Loader2, Gift, ShieldCheck, ShieldX } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_DROP_ABI, DROP_TYPE_LABELS, GATING_TYPE_LABELS, isDropActive, USDC_DECIMALS } from '@/utils/arcdrop'
import { useNetwork } from '@/NetworkContext'
import { loadManifest, assertEligible, ManifestError, type ManifestEntry, type ClaimManifest } from '@/utils/manifest'
const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const glass = {
  card: {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(28px) saturate(190%)',
    WebkitBackdropFilter: 'blur(28px) saturate(190%)',
    border: '1px solid rgba(255,255,255,0.72)',
    boxShadow: '0 8px 40px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.52)',
    border: '1px solid rgba(255,255,255,0.60)',
  } as React.CSSProperties,
}

const STATUS_CONFIG = {
  Active:   { bg: 'rgba(26,128,71,0.10)',   text: 'var(--success)', dot: 'var(--success)' },
  Paused:   { bg: 'rgba(245,158,11,0.12)',  text: '#d97706',        dot: '#d97706' },
  Expired:  { bg: 'rgba(186,43,76,0.10)',   text: 'var(--danger)',  dot: 'var(--danger)' },
  Refunded: { bg: 'rgba(138,132,156,0.12)', text: 'var(--subtle)',  dot: 'var(--subtle)' },
}

interface Props {
  dropId: bigint
  onBack: () => void
}

// ── Contract revert messages ──────────────────────────────────────────────────

const REVERT_MESSAGES: Record<string, string> = {
  AlreadyClaimed:    'You have already claimed from this drop.',
  DropExpired:       'This drop has expired and is no longer accepting claims.',
  DropIsPaused:      'This drop is currently paused by the creator.',
  InvalidProof:      'Your Merkle proof is invalid. The manifest may not match this contract deployment.',
  GatingFailed:      'You do not meet the gating requirements (NFT or token balance too low).',
  InsufficientFunds: 'The drop has run out of funds — all allocations have been claimed.',
  DropNotRefundable: 'This drop is no longer active.',
  DropNotFound:      'Drop not found on-chain.',
}

function parseRevertMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  for (const [key, human] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return human
  }
  if (msg.includes('user rejected') || msg.includes('User rejected')) return 'Transaction rejected in wallet.'
  if (msg.includes('insufficient funds')) return 'Your wallet does not have enough gas to pay for this transaction.'
  return 'Transaction failed. See console for details.'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClaimPage({ dropId, onBack }: Props) {
  const { contractAddress: ARC_DROP_ADDRESS, config: netConfig } = useNetwork()
  const CHAIN_ID = netConfig.chainId
  const ACTIVE_NETWORK = netConfig

  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  // ── On-chain reads ──────────────────────────────────────────────────────────

  const { data: raw, refetch: refetchDrop } = useReadContract({
    address: ARC_DROP_ADDRESS,
    abi: ARC_DROP_ABI,
    functionName: 'getDrop',
    args: [dropId],
    chainId: CHAIN_ID,
    query: { enabled: !!ARC_DROP_ADDRESS },
  })

  const { data: alreadyClaimed, refetch: refetchClaimed } = useReadContract({
    address: ARC_DROP_ADDRESS,
    abi: ARC_DROP_ABI,
    functionName: 'hasClaimed',
    args: address ? [dropId, address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!ARC_DROP_ADDRESS },
  })

  // All drops use USDC on this contract — 6 decimals
  const dec = USDC_DECIMALS
  const symbol = 'USDC'

  // ── Manifest + eligibility ──────────────────────────────────────────────────

  const [manifest, setManifest] = useState<ClaimManifest | null>(null)
  const [eligibleEntry, setEligibleEntry] = useState<ManifestEntry | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const [, startTransition] = useTransition()

  const isAllowlist = raw?.gatingType === 1  // GatingType.ALLOWLIST

  // Load manifest once when we know the drop is ALLOWLIST-gated and a wallet is connected
  useEffect(() => {
    if (!isAllowlist || !address || manifest !== null || manifestLoading) return

    startTransition(() => {
      setManifestLoading(true)
      setManifestError(null)
    })

    loadManifest()
      .then(m => {
        startTransition(() => {
          setManifest(m)
          try {
            const entry = assertEligible(m, address)
            setEligibleEntry(entry)
          } catch (e) {
            setManifestError(e instanceof ManifestError ? e.message : 'Eligibility check failed.')
          }
        })
      })
      .catch(e => {
        startTransition(() => {
          setManifestError(e instanceof ManifestError ? e.message : 'Failed to load claim manifest.')
        })
      })
      .finally(() => { startTransition(() => setManifestLoading(false)) })
  }, [isAllowlist, address, manifest, manifestLoading, startTransition])

  // Reset manifest state on wallet change
  useEffect(() => {
    startTransition(() => {
      setManifest(null)
      setEligibleEntry(null)
      setManifestError(null)
    })
  }, [address, startTransition])

  // ── Transaction ─────────────────────────────────────────────────────────────

  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const [txError, setTxError] = useState<string | null>(null)

  useEffect(() => {
    if (writeError) startTransition(() => setTxError(parseRevertMessage(writeError)))
  }, [writeError, startTransition])

  useEffect(() => {
    if (isSuccess) {
      void refetchDrop()
      void refetchClaimed()
    }
  }, [isSuccess, refetchDrop, refetchClaimed])

  // ── Derived state ───────────────────────────────────────────────────────────

  const drop = raw ?? null
  const active = drop ? isDropActive(drop) : false
  const isMystery = drop?.dropType === 1

  // Determine display amount:
  // ALLOWLIST: from manifest entry (authoritative)
  // PUBLIC/GATED-non-ALLOWLIST: from amountPerClaim
  // MYSTERY: show range
  const displayAmount: bigint | null =
    isAllowlist && eligibleEntry != null ? eligibleEntry.amount
    : drop && !isMystery && !isAllowlist ? drop.amountPerClaim
    : null

  const busy = isPending || isConfirming

  const statusKey: keyof typeof STATUS_CONFIG = !drop ? 'Active'
    : drop.refunded ? 'Refunded'
    : drop.paused   ? 'Paused'
    : active        ? 'Active'
    : 'Expired'
  const sc = STATUS_CONFIG[statusKey]

  const expiresLabel = drop && drop.expiresAt > 0n
    ? new Date(Number(drop.expiresAt) * 1000).toLocaleDateString(undefined,
        { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never'

  // ── Claim handler ───────────────────────────────────────────────────────────

  const handleClaim = () => {
    if (chainId !== CHAIN_ID) { switchChain({ chainId: CHAIN_ID }); return }
    setTxError(null)
    resetWrite()

    const proof: `0x${string}`[] = isAllowlist && eligibleEntry ? eligibleEntry.proof : []
    const amount = isAllowlist && eligibleEntry ? eligibleEntry.amount : 0n

    writeContract({
      address: ARC_DROP_ADDRESS,
      abi: ARC_DROP_ABI,
      functionName: 'claim',
      args: [dropId, proof, amount],
      chainId: CHAIN_ID,
    })
  }

  // ── Claim button disabled logic ─────────────────────────────────────────────

  const claimDisabled = busy
    || !active
    || !!alreadyClaimed
    || (isAllowlist && (!eligibleEntry || !!manifestError))

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto px-5 pt-4 pb-24">
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft size={15} />
        All drops
      </button>

      {!ARC_DROP_ADDRESS ? (
        <ErrorCard message="Contract address not configured. Set NEXT_PUBLIC_ARCDROP_CONTRACT_ADDRESS in your .env file." />
      ) : !drop ? (
        <LoadingCard message="Loading drop…" />
      ) : (
        <div className="space-y-4">

          {/* ── Hero card ──────────────────────────────────────────── */}
          <div className="rounded-3xl overflow-hidden" style={glass.card}>
            <div style={{ height: 3, background: spectral }} />
            <div className="p-6">
              {/* Status + type badges */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: sc.bg, color: sc.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                  {statusKey}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                  {DROP_TYPE_LABELS[drop.dropType]}
                </span>
                {isAllowlist && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(95,190,255,0.15)', color: '#1061a6' }}>
                    {GATING_TYPE_LABELS[drop.gatingType]}
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  Drop #{dropId.toString()}
                </span>
              </div>

              {/* Name */}
              <h1 className="display text-2xl font-bold mb-5" style={{ color: 'var(--ink)' }}>
                {drop.name}
              </h1>

              {/* Amount hero */}
              <div className="mb-5">
                {isMystery ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="display text-6xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>?</span>
                      <span className="text-xl font-semibold" style={{ color: 'var(--subtle)' }}>{symbol}</span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                      Between {Amount.fromRaw(drop.minAmount, dec).toFixed(2)} and {Amount.fromRaw(drop.maxAmount, dec).toFixed(2)} {symbol}
                    </p>
                  </>
                ) : isAllowlist ? (
                  <>
                    {eligibleEntry ? (
                      <div className="flex items-baseline gap-2">
                        <span className="display text-6xl font-bold tabular-nums"
                          style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
                          {Amount.fromRaw(eligibleEntry.amount, dec).toFixed(dec > 6 ? 4 : 2)}
                        </span>
                        <span className="text-xl font-semibold" style={{ color: 'var(--subtle)' }}>{symbol}</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="display text-4xl font-bold" style={{ color: 'var(--subtle)', letterSpacing: '-0.04em' }}>
                          {!isConnected ? 'Connect wallet' : manifestLoading ? 'Checking…' : '—'}
                        </span>
                      </div>
                    )}
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                      Your individually assigned reward
                    </p>
                  </>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="display text-6xl font-bold tabular-nums"
                      style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
                      {displayAmount != null ? Amount.fromRaw(displayAmount, dec).toFixed(dec > 6 ? 4 : 2) : '—'}
                    </span>
                    <span className="text-xl font-semibold" style={{ color: 'var(--subtle)' }}>{symbol}</span>
                  </div>
                )}
              </div>

              {/* Stats pills */}
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                  <Users size={11} />
                  {drop.claimedCount.toString()} / {drop.maxClaims > 0n ? drop.maxClaims.toString() : '∞'} claimed
                </div>
                {drop.expiresAt > 0n && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
                    <Clock size={11} />
                    Expires {expiresLabel}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Eligibility status (ALLOWLIST only) ───────────────── */}
          {isAllowlist && isConnected && (
            <div className="rounded-2xl overflow-hidden" style={glass.card}>
              <div className="px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--subtle)' }}>
                  Eligibility
                </p>
                {manifestLoading ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                    <Loader2 size={14} className="animate-spin" /> Checking your address…
                  </div>
                ) : manifestError ? (
                  <div className="flex items-start gap-2.5 rounded-2xl p-3"
                    style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.15)' }}>
                    <ShieldX size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                    <p className="text-sm" style={{ color: 'var(--danger)' }}>{manifestError}</p>
                  </div>
                ) : eligibleEntry ? (
                  <div className="flex items-center gap-2.5 rounded-2xl p-3"
                    style={{ background: 'rgba(26,128,71,0.07)', border: '1px solid rgba(26,128,71,0.15)' }}>
                    <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                        Eligible — {Amount.fromRaw(eligibleEntry.amount, dec).toFixed(dec > 6 ? 4 : 2)} {symbol} assigned
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Proof verified client-side · contract is authoritative
                      </p>
                    </div>
                  </div>
                ) : manifest ? (
                  <div className="flex items-start gap-2.5 rounded-2xl p-3"
                    style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.15)' }}>
                    <ShieldX size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                    <p className="text-sm" style={{ color: 'var(--danger)' }}>
                      This wallet is not on the allowlist for this drop.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* ── Claim action card ──────────────────────────────────── */}
          <div className="rounded-3xl overflow-hidden" style={glass.card}>
            <div className="p-5">
              {!isConnected ? (
                <div className="flex flex-col items-center gap-4 py-3">
                  <Gift size={28} style={{ color: 'var(--subtle)' }} />
                  <p className="text-sm text-center font-medium" style={{ color: 'var(--muted)' }}>
                    Connect your wallet to claim
                  </p>
                  <ConnectKitButton />
                </div>
              ) : chainId !== CHAIN_ID ? (
                <div className="space-y-3">
                  <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
                    Switch to {ACTIVE_NETWORK.label} to claim
                  </p>
                  <button
                    onClick={() => switchChain({ chainId: CHAIN_ID })}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    Switch Network
                  </button>
                </div>
              ) : isSuccess || alreadyClaimed ? (
                <SuccessState hash={hash} alreadyClaimed={!!alreadyClaimed && !isSuccess} chainId={CHAIN_ID} />
              ) : !active ? (
                <div className="flex items-center gap-2.5 rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
                  <AlertCircle size={18} style={{ color: 'var(--muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    This drop is {drop.paused ? 'paused' : drop.refunded ? 'refunded' : 'expired'}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Amount preview row */}
                  {displayAmount != null && (
                    <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={glass.inner}>
                      <span className="text-sm" style={{ color: 'var(--muted)' }}>
                        {isMystery ? 'Estimated payout' : 'You will receive'}
                      </span>
                      <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {isMystery ? '~' : ''}{Amount.fromRaw(displayAmount, dec).toFixed(dec > 6 ? 4 : 2)}{' '}
                        <span style={{ color: 'var(--subtle)' }}>{symbol}</span>
                      </span>
                    </div>
                  )}

                  {/* Transaction error */}
                  {txError && (
                    <div className="flex items-start gap-2 rounded-2xl px-4 py-3"
                      style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.15)' }}>
                      <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                      <p className="text-xs" style={{ color: 'var(--danger)' }}>{txError}</p>
                    </div>
                  )}

                  {/* Claim button */}
                  <button
                    onClick={handleClaim}
                    disabled={claimDisabled}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'var(--accent)',
                      color: 'white',
                      boxShadow: claimDisabled ? 'none' : '0 4px 16px rgba(18,45,69,0.22)',
                    }}
                  >
                    {busy ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={15} className="animate-spin" />
                        {isPending ? 'Confirm in wallet…' : 'Confirming…'}
                      </span>
                    ) : isMystery ? 'Reveal & Claim' : `Claim ${symbol}`}
                  </button>

                  {/* ALLOWLIST note */}
                  {isAllowlist && eligibleEntry && (
                    <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
                      Your Merkle proof will be submitted with this transaction.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Drop details ───────────────────────────────────────── */}
          <div className="rounded-3xl p-5 space-y-2.5"
            style={{ background: 'rgba(255,255,255,0.42)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--subtle)' }}>
              Drop Details
            </p>
            <Row label="Type"        value={DROP_TYPE_LABELS[drop.dropType]} />
            <Row label="Gating"      value={GATING_TYPE_LABELS[drop.gatingType]} />
            <Row label="Token"       value={symbol} />
            <Row label="Total pool"  value={`${Amount.fromRaw(drop.totalAmount, dec).toFixed(dec > 6 ? 4 : 2)} ${symbol}`} />
            <Row label="Claimed"     value={`${Amount.fromRaw(drop.totalClaimed, dec).toFixed(dec > 6 ? 4 : 2)} ${symbol}`} />
            <Row label="Creator"     value={`${drop.creator.slice(0, 10)}…${drop.creator.slice(-8)}`} mono />
          </div>

        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SuccessState({ hash, alreadyClaimed, chainId }: { hash?: `0x${string}`; alreadyClaimed: boolean; chainId: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(26,128,71,0.12)' }}>
        <Check size={26} style={{ color: 'var(--success)' }} />
      </div>
      <div>
        <p className="font-bold" style={{ color: 'var(--success)' }}>
          {alreadyClaimed ? 'Already claimed' : 'Claimed!'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          {alreadyClaimed ? 'This wallet has already received its reward.' : 'Tokens sent to your wallet.'}
        </p>
      </div>
      {hash && (
        <a
          href={buildTxExplorerUrl(chainId, hash)}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs rounded-lg px-3 py-1.5"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          <ExternalLink size={11} /> View transaction
        </a>
      )}
    </div>
  )
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="rounded-3xl overflow-hidden" style={glass.card}>
      <div style={{ height: 3, background: spectral }} />
      <div className="p-8 flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted)' }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{message}</p>
      </div>
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl p-6 text-center" style={glass.card}>
      <AlertCircle size={24} style={{ color: 'var(--muted)' }} className="mx-auto mb-2" />
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{message}</p>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={mono ? 'mono' : 'font-semibold'} style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}
