import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { Plus, Gift, ExternalLink, Pause, Play, RotateCcw, Share2, AlertCircle, Loader2, ChevronRight, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { ARC_DROP_ABI, DROP_TYPE_LABELS, isDropActive, dropProgress, USDC_DECIMALS } from '@/utils/arcdrop'
import { useNetwork } from '@/NetworkContext'
import CreateDropModal from './CreateDropModal'

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

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

interface Props {
  onShareDrop: (dropId: bigint) => void
}

export default function Dashboard({ onShareDrop }: Props) {
  const { contractAddress: ARC_DROP_ADDRESS, config: netConfig, contractOk } = useNetwork()
  const CHAIN_ID = netConfig.chainId
  const USDC_ADDRESS = netConfig.usdcAddress
  const ACTIVE_NETWORK = netConfig

  const { address, isConnected, chainId } = useAccount()
  const [showCreate, setShowCreate] = useState(false)

  const { data: dropCount, refetch: refetchCount } = useReadContract({
    address: contractOk ? ARC_DROP_ADDRESS : undefined,
    abi: ARC_DROP_ABI,
    functionName: 'dropCount',
    chainId: CHAIN_ID,
    query: { enabled: contractOk },
  })

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const formattedBalance = usdcBalance != null
    ? Amount.fromRaw(usdcBalance, USDC_DECIMALS).toFixed(2)
    : null

  const handleDropCreated = () => {
    setShowCreate(false)
    void refetchCount()
    toast.success('Drop created!')
  }

  if (!contractOk) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-10">
        <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center" style={glass.card}>
          <AlertCircle size={28} style={{ color: 'var(--muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Contract not deployed</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Set <span className="mono bg-slate-100 px-1 rounded">VITE_ARC_DROP_ADDRESS</span> in .env to activate.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-5 pt-4 pb-24">

      {/* Hero balance + CTA */}
      <div className="rounded-3xl overflow-hidden mb-6" style={glass.card}>
        <div style={{ height: 3, background: spectral }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--subtle)' }}>
                Your USDC Balance
              </p>
              {!isConnected ? (
                <p className="display text-4xl font-bold" style={{ color: 'var(--ink)' }}>—</p>
              ) : formattedBalance == null ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="display text-5xl font-bold tabular-nums tracking-tight" style={{ color: 'var(--ink)' }}>
                    ${formattedBalance}
                  </span>
                  <span className="text-lg font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
                {isConnected ? `${ACTIVE_NETWORK.label} · USDC` : 'Connect wallet to view live balance'}
              </p>
            </div>

            {isConnected && (
              <button
                onClick={() => setShowCreate(true)}
                className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  boxShadow: '0 4px 16px rgba(18,45,69,0.24)',
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
                New Drop
              </button>
            )}
          </div>

          {/* Stats strip */}
          {isConnected && dropCount != null && dropCount > 0n && (
            <div
              className="mt-5 flex items-center gap-5 pt-4"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-2xl font-bold tabular-nums display" style={{ color: 'var(--ink)' }}>
                  {dropCount.toString()}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Total drops</p>
              </div>
              <div
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(26,128,71,0.10)', color: 'var(--success)' }}
              >
                <Zap size={11} />
                {ACTIVE_NETWORK.label}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty / not connected state */}
      {!isConnected ? (
        <div className="rounded-3xl p-10 flex flex-col items-center gap-5 text-center" style={glass.card}>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <Gift size={30} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="display text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
              USDC Drop Links
            </h2>
            <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
              Create shareable links that let anyone claim USDC — public, mystery amounts, or gated by allowlist or NFT.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center">
            {['Public drops', 'Mystery amounts', 'NFT gated', 'Link sharing', 'Instant USDC'].map(f => (
              <span
                key={f}
                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
              >
                {f}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Connect your wallet to get started
          </p>
        </div>
      ) : (
        <DropList
          address={address!}
          dropCount={dropCount ?? 0n}
          onShare={onShareDrop}
          onRefetch={() => { void refetchCount() }}
          chainId={chainId}
          dropListChainId={CHAIN_ID}
          dropListContract={ARC_DROP_ADDRESS}
          dropListLabel={ACTIVE_NETWORK.label}
        />
      )}

      {showCreate && (
        <CreateDropModal
          onClose={() => setShowCreate(false)}
          onCreated={handleDropCreated}
        />
      )}
    </div>
  )
}

// ── Drop list ──────────────────────────────────────────────────────────────────

interface DropListProps {
  address: `0x${string}`
  dropCount: bigint
  onShare: (id: bigint) => void
  onRefetch: () => void
  chainId?: number
  dropListChainId: number
  dropListContract: `0x${string}`
  dropListLabel: string
}

function DropList({ address, dropCount, onShare, onRefetch, chainId, dropListChainId, dropListContract, dropListLabel }: DropListProps) {
  const ids = Array.from({ length: Number(dropCount) }, (_, i) => BigInt(i + 1)).reverse()

  if (ids.length === 0) {
    return (
      <div
        className="rounded-3xl p-10 flex flex-col items-center gap-3 text-center"
        style={{ background: 'rgba(255,255,255,0.42)', border: '1.5px dashed var(--border-strong)' }}
      >
        <Gift size={28} style={{ color: 'var(--subtle)' }} />
        <p className="font-semibold text-sm" style={{ color: 'var(--muted)' }}>No drops yet</p>
        <p className="text-xs max-w-xs" style={{ color: 'var(--subtle)' }}>
          Click "New Drop" to create your first USDC drop link
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
          Your Drops
        </p>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>{ids.length} total</p>
      </div>
      <div className="space-y-3">
        {ids.map(id => (
          <DropCard
            key={id.toString()}
            dropId={id}
            myAddress={address}
            onShare={onShare}
            onRefetch={onRefetch}
            walletChainId={chainId}
            chainId={dropListChainId}
            contractAddress={dropListContract}
            networkLabel={dropListLabel}
          />
        ))}
      </div>
    </div>
  )
}

// ── Single drop card ───────────────────────────────────────────────────────────

interface DropCardProps {
  dropId: bigint
  myAddress: `0x${string}`
  onShare: (id: bigint) => void
  onRefetch: () => void
  walletChainId?: number
  chainId: number
  contractAddress: `0x${string}`
  networkLabel: string
}

const STATUS_CONFIG = {
  Active:   { bg: 'rgba(26,128,71,0.10)',   text: 'var(--success)', dot: 'var(--success)' },
  Paused:   { bg: 'rgba(245,158,11,0.12)',  text: '#d97706',        dot: '#d97706' },
  Expired:  { bg: 'rgba(186,43,76,0.10)',   text: 'var(--danger)',  dot: 'var(--danger)' },
  Refunded: { bg: 'rgba(138,132,156,0.12)', text: 'var(--subtle)',  dot: 'var(--subtle)' },
}

const DROP_TYPE_COLORS: Record<number, string> = {
  0: 'rgba(133,177,237,0.18)',
  1: 'rgba(175,143,244,0.18)',
  2: 'rgba(255,205,131,0.20)',
}

function DropCard({ dropId, myAddress, onShare, onRefetch, walletChainId, chainId: CHAIN_ID, contractAddress: ARC_DROP_ADDRESS, networkLabel }: DropCardProps) {
  const { data: raw, refetch } = useReadContract({
    address: ARC_DROP_ADDRESS,
    abi: ARC_DROP_ABI,
    functionName: 'getDrop',
    args: [dropId],
    chainId: CHAIN_ID,
  })

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    onReplaced: () => { void refetch(); onRefetch() },
  })

  if (!raw) {
    return (
      <div className="rounded-2xl h-24 animate-pulse" style={{ background: 'rgba(255,255,255,0.5)' }} />
    )
  }

  const drop = raw
  const isOwner = drop.creator.toLowerCase() === myAddress.toLowerCase()
  const active = isDropActive(drop)
  const pct = dropProgress(drop)
  const decimals = USDC_DECIMALS
  const total = Amount.fromRaw(drop.totalAmount, decimals).toFixed(2)
  const claimed = Amount.fromRaw(drop.totalClaimed, decimals).toFixed(2)
  const perClaim = drop.dropType === 1
    ? `$${Amount.fromRaw(drop.minAmount, decimals).toFixed(2)}–$${Amount.fromRaw(drop.maxAmount, decimals).toFixed(2)}`
    : `$${Amount.fromRaw(drop.amountPerClaim, decimals).toFixed(2)}`

  const statusKey = (drop.refunded ? 'Refunded' : drop.paused ? 'Paused' : active ? 'Active' : 'Expired')
  const sc = STATUS_CONFIG[statusKey]

  const busy = isPending || isConfirming

  const handlePause = () => {
    if (walletChainId !== CHAIN_ID) { toast.error(`Switch to ${networkLabel}`); return }
    writeContract({ address: ARC_DROP_ADDRESS, abi: ARC_DROP_ABI, functionName: drop.paused ? 'unpauseDrop' : 'pauseDrop', args: [dropId] })
  }

  const handleRefund = () => {
    if (walletChainId !== CHAIN_ID) { toast.error(`Switch to ${networkLabel}`); return }
    writeContract({ address: ARC_DROP_ADDRESS, abi: ARC_DROP_ABI, functionName: 'refund', args: [dropId] })
  }

  const handleShare = () => {
    const url = `${window.location.origin}${window.location.pathname}?drop=${dropId}`
    void navigator.clipboard.writeText(url)
    toast.success('Claim link copied!')
  }

  if (hash && !isConfirming) {
    void refetch()
    onRefetch()
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
      style={glass.card}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {/* Status badge */}
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: sc.bg, color: sc.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                {statusKey}
              </span>
              {/* Type chip */}
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: DROP_TYPE_COLORS[drop.dropType], color: 'var(--ink-2)' }}
              >
                {DROP_TYPE_LABELS[drop.dropType]}
              </span>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>#{dropId.toString()}</span>
            </div>
            <p className="font-bold text-base truncate" style={{ color: 'var(--ink)' }}>
              {drop.name}
            </p>
          </div>

          <button
            onClick={() => onShare(dropId)}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <ChevronRight size={13} strokeWidth={2.5} />
            View
          </button>
        </div>

        {/* Amount + stats */}
        <div className="flex items-center gap-4 mb-3">
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Per claim</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{perClaim}</p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Claimed</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {drop.claimedCount.toString()} / {drop.maxClaims > 0n ? drop.maxClaims.toString() : '∞'}
            </p>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Pool</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>${total}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: active
                ? `linear-gradient(90deg, #1061a6, #122d45)`
                : 'var(--subtle)',
            }}
          />
        </div>
        <p className="text-xs tabular-nums mb-3" style={{ color: 'var(--subtle)' }}>
          ${claimed} of ${total} claimed
        </p>

        {/* Owner actions */}
        {isOwner && (
          <div
            className="flex items-center gap-2 pt-3 flex-wrap"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <ActionBtn icon={<Share2 size={12} />} label="Copy link" onClick={handleShare} disabled={busy} />
            {!drop.refunded && (
              <ActionBtn
                icon={drop.paused ? <Play size={12} /> : <Pause size={12} />}
                label={drop.paused ? 'Unpause' : 'Pause'}
                onClick={handlePause}
                disabled={busy}
              />
            )}
            {!drop.refunded && drop.totalClaimed < drop.totalAmount && (
              <ActionBtn icon={<RotateCcw size={12} />} label="Refund" onClick={handleRefund} disabled={busy} danger />
            )}
            {busy && (
              <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                <Loader2 size={11} className="animate-spin" />
                {isPending ? 'Confirm in wallet…' : 'Confirming…'}
              </span>
            )}
            {hash && !busy && (
              <a
                href={buildTxExplorerUrl(CHAIN_ID, hash)}
                target="_blank" rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs"
                style={{ color: 'var(--subtle)' }}
              >
                <ExternalLink size={11} /> Tx
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  icon, label, onClick, disabled, danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
      style={danger
        ? { background: 'rgba(186,43,76,0.09)', color: 'var(--danger)' }
        : { background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
    >
      {icon}
      {label}
    </button>
  )
}
