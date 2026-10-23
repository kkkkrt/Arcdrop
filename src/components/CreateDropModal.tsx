import { useState, useEffect, useRef, startTransition } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi, keccak256, encodePacked } from 'viem'
import { X, AlertCircle, Check, Loader2 } from 'lucide-react'
import { parseUnitsExact } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_DROP_ABI } from '@/utils/arcdrop'
import { useNetwork } from '@/NetworkContext'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const USDC_DECIMALS = 6

const glass = {
  card: {
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    border: '1px solid rgba(255,255,255,0.78)',
    boxShadow: '0 16px 60px rgba(18,45,69,0.14), inset 0 1px 0 rgba(255,255,255,0.7)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.56)',
    border: '1px solid rgba(255,255,255,0.64)',
  } as React.CSSProperties,
}

interface Props {
  onClose: () => void
  onCreated: () => void
}

type DropType = 0 | 1 | 2
type GatingType = 1 | 2 | 3

const DROP_TYPE_OPTIONS = [
  {
    value: 0 as DropType,
    label: 'Public',
    desc: 'Fixed amount for every wallet — anyone can claim until funds run out.',
    icon: '≡',
    color: 'rgba(133,177,237,0.20)',
    activeColor: '#1061a6',
  },
  {
    value: 1 as DropType,
    label: 'Mystery',
    desc: 'Each claimer gets a random USDC amount between your min and max.',
    icon: '?',
    color: 'rgba(175,143,244,0.20)',
    activeColor: '#7c3aed',
  },
  {
    value: 2 as DropType,
    label: 'Gated',
    desc: 'Only wallets on your allowlist or holding a specific NFT/token can claim.',
    icon: '⬡',
    color: 'rgba(255,205,131,0.28)',
    activeColor: '#b45309',
  },
]

const GATING_OPTIONS: { value: GatingType; label: string; desc: string }[] = [
  { value: 1, label: 'Allowlist', desc: 'Paste wallet addresses — only those wallets can claim.' },
  { value: 2, label: 'NFT Holder', desc: 'Claimer must hold at least 1 NFT from a contract.' },
  { value: 3, label: 'Token Holder', desc: 'Claimer must hold a minimum token balance.' },
]

export default function CreateDropModal({ onClose, onCreated }: Props) {
  const { contractAddress: ARC_DROP_ADDRESS, config: netConfig } = useNetwork()
  const CONFIGURED_CHAIN_ID = netConfig.chainId
  const USDC_ADDRESS = netConfig.usdcAddress
  const ACTIVE_NETWORK = netConfig

  const { address, chainId } = useAccount()
  const [dropType, setDropType] = useState<DropType>(0)
  const [name, setName] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [amountPerClaim, setAmountPerClaim] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [maxClaims, setMaxClaims] = useState('')
  const [expiryDays, setExpiryDays] = useState('')

  // Gated-specific
  const [gatingType, setGatingType] = useState<GatingType>(1)
  const [allowlistRaw, setAllowlistRaw] = useState('')
  const [gatingContract, setGatingContract] = useState('')
  const [gatingMinBalance, setGatingMinBalance] = useState('')

  const [step, setStep] = useState<'form' | 'approving' | 'creating' | 'done'>('form')
  const [error, setError] = useState('')

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ARC_DROP_ADDRESS] : undefined,
    chainId: CONFIGURED_CHAIN_ID,
    query: { enabled: !!address },
  })

  const pendingParams = useRef<Parameters<typeof createDrop>[0] | null>(null)

  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: createDrop, data: createHash, isPending: createPending } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash })

  // After approval confirms: fire createDrop
  useEffect(() => {
    if (!approveSuccess || step !== 'approving') return
    startTransition(() => setStep('creating'))
    refetchAllowance().then(() => {
      if (pendingParams.current) createDrop(pendingParams.current)
    }).catch(() => {
      if (pendingParams.current) createDrop(pendingParams.current)
    })
  }, [approveSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // After createDrop confirms: show success
  useEffect(() => {
    if (!createSuccess || step !== 'creating') return
    startTransition(() => { setStep('done'); onCreated() })
  }, [createSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function _parseUSDC(val: string) {
    try { return parseUnitsExact(val, USDC_DECIMALS) } catch { return 0n }
  }
  const _parsedTotal = () => _parseUSDC(totalAmount)
  const _parsedPerClaim = () => _parseUSDC(amountPerClaim)
  const _parsedMin = () => _parseUSDC(minAmount)
  const _parsedMax = () => _parseUSDC(maxAmount)

  function _buildMerkleRoot(addresses: string[]): `0x${string}` {
    const leaves = addresses
      .map(a => a.trim().toLowerCase())
      .filter(a => /^0x[0-9a-f]{40}$/.test(a))
      .map(a => keccak256(encodePacked(['address'], [a as `0x${string}`])))
    if (leaves.length === 0) return '0x0000000000000000000000000000000000000000000000000000000000000000'
    let layer = [...leaves].sort()
    while (layer.length > 1) {
      const next: `0x${string}`[] = []
      for (let i = 0; i < layer.length; i += 2) {
        if (i + 1 < layer.length) {
          const a = layer[i], b = layer[i + 1]
          next.push(a <= b
            ? keccak256(encodePacked(['bytes32', 'bytes32'], [a, b]))
            : keccak256(encodePacked(['bytes32', 'bytes32'], [b, a])))
        } else {
          next.push(layer[i])
        }
      }
      layer = next
    }
    return layer[0]
  }

  function _buildCreateParams() {
    const total = _parsedTotal()
    const expiresAt = expiryDays
      ? BigInt(Math.floor(Date.now() / 1000) + Number(expiryDays) * 86400)
      : 0n
    const mysterySecret: `0x${string}` = dropType === 1
      ? keccak256(encodePacked(['uint256', 'address'], [BigInt(Date.now()), address!]))
      : '0x0000000000000000000000000000000000000000000000000000000000000000'

    let merkleRoot: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
    let resolvedGatingType = 0
    let resolvedGatingContract: `0x${string}` = '0x0000000000000000000000000000000000000000'
    let resolvedGatingMinBalance = 0n

    if (dropType === 2) {
      resolvedGatingType = gatingType
      if (gatingType === 1) {
        merkleRoot = _buildMerkleRoot(allowlistRaw.split('\n'))
      } else if (gatingType === 2) {
        resolvedGatingContract = gatingContract.trim() as `0x${string}`
      } else if (gatingType === 3) {
        resolvedGatingContract = gatingContract.trim() as `0x${string}`
        resolvedGatingMinBalance = BigInt(gatingMinBalance || '1')
      }
    }

    return {
      address: ARC_DROP_ADDRESS,
      abi: ARC_DROP_ABI,
      functionName: 'createDrop' as const,
      args: [{
        dropType,
        gatingType: resolvedGatingType,
        totalAmount: total,
        amountPerClaim: (dropType === 0 || dropType === 2) ? _parsedPerClaim() : 0n,
        minAmount: dropType === 1 ? _parsedMin() : 0n,
        maxAmount: dropType === 1 ? _parsedMax() : 0n,
        maxClaims: BigInt(maxClaims || '0'),
        expiresAt,
        merkleRoot,
        gatingContract: resolvedGatingContract,
        gatingMinBalance: resolvedGatingMinBalance,
        mysterySecret,
        name,
        metadataUri: '',
      }] as const,
      chainId: CONFIGURED_CHAIN_ID,
    }
  }

  const handleSubmit = () => {
    setError('')
    if (chainId !== CONFIGURED_CHAIN_ID) {
      setError(`Switch to ${ACTIVE_NETWORK.label} first`)
      return
    }
    if (!name.trim()) { setError('Enter a drop name'); return }
    const total = _parsedTotal()
    if (total === 0n) { setError('Enter a valid total amount'); return }

    if (dropType === 0) {
      if (_parsedPerClaim() === 0n) { setError('Enter amount per claim'); return }
      if (_parsedPerClaim() > total) { setError('Amount per claim exceeds total'); return }
    }
    if (dropType === 1) {
      if (_parsedMin() === 0n || _parsedMax() === 0n) { setError('Enter min and max amounts'); return }
      if (_parsedMax() < _parsedMin()) { setError('Max must be ≥ min'); return }
      if (_parsedMax() > total) { setError('Max amount exceeds total'); return }
      if (!maxClaims || BigInt(maxClaims) === 0n) { setError('Enter max claimers for mystery drop'); return }
    }
    if (dropType === 2) {
      if (_parsedPerClaim() === 0n) { setError('Enter amount per claim'); return }
      if (!maxClaims || BigInt(maxClaims) === 0n) { setError('Enter max claimers'); return }
      if (gatingType === 1) {
        const addrs = allowlistRaw.split('\n').map(a => a.trim()).filter(a => a)
        if (addrs.length === 0) { setError('Enter at least one wallet address for the allowlist'); return }
        const invalid = addrs.find(a => !/^0x[0-9a-fA-F]{40}$/.test(a))
        if (invalid) { setError(`Invalid address: ${invalid}`); return }
      }
      if (gatingType === 2 || gatingType === 3) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(gatingContract.trim())) {
          setError('Enter a valid contract address'); return
        }
      }
      if (gatingType === 3) {
        if (!gatingMinBalance || BigInt(gatingMinBalance) === 0n) {
          setError('Enter minimum token balance required'); return
        }
      }
    }

    const params = _buildCreateParams()
    pendingParams.current = params

    const needsApprove = !allowance || allowance < total
    if (needsApprove) {
      setStep('approving')
      approve({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ARC_DROP_ADDRESS, total],
        chainId: CONFIGURED_CHAIN_ID,
      })
    } else {
      setStep('creating')
      createDrop(params)
    }
  }

  const busy = approvePending || approveConfirming || createPending || createConfirming

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(18,45,69,0.30)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={glass.card}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ height: 4, background: spectral }} />

        {/* Drag handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
        </div>

        <div className="px-5 pt-4 pb-6 overflow-y-auto max-h-[85dvh]">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>New Drop</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Fund a USDC claim link on {ACTIVE_NETWORK.label}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              <X size={18} style={{ color: 'var(--muted)' }} />
            </button>
          </div>

          {step === 'done' ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(26,128,71,0.12)' }}
              >
                <Check size={28} style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Drop created!</p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  Share the claim link so wallets can claim USDC.
                </p>
              </div>
              {createHash && (
                <a
                  href={buildTxExplorerUrl(CONFIGURED_CHAIN_ID, createHash)}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs rounded-xl px-4 py-2"
                  style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
                >
                  View transaction
                </a>
              )}
              <button
                onClick={onClose}
                className="mt-1 w-full py-3.5 rounded-2xl font-bold text-sm"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Drop type */}
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-[0.09em]" style={{ color: 'var(--subtle)' }}>
                  Drop Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DROP_TYPE_OPTIONS.map(opt => {
                    const sel = dropType === opt.value
                    return (
                      <button
                        key={opt.label}
                        onClick={() => setDropType(opt.value)}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-center transition-all"
                        style={{
                          background: sel ? opt.color : 'var(--surface-muted)',
                          border: sel ? `1.5px solid ${opt.activeColor}40` : '1.5px solid transparent',
                          outline: sel ? `2px solid ${opt.activeColor}30` : 'none',
                        }}
                      >
                        <span className="text-lg font-bold" style={{ color: sel ? opt.activeColor : 'var(--subtle)', fontFamily: 'monospace' }}>
                          {opt.icon}
                        </span>
                        <span className="text-xs font-bold" style={{ color: sel ? opt.activeColor : 'var(--ink-2)' }}>
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--subtle)' }}>
                  {DROP_TYPE_OPTIONS[dropType].desc}
                </p>
              </div>

              {/* Drop name */}
              <Field label="Drop Name">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Team USDC Gift"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ ...glass.inner, color: 'var(--ink)' }}
                />
              </Field>

              {/* Total USDC */}
              <Field label="Total USDC to Fund">
                <input
                  type="number" min="0" step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="100.00"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                  style={{ ...glass.inner, color: 'var(--ink)' }}
                />
              </Field>

              {/* Per claim (PUBLIC / GATED) */}
              {(dropType === 0 || dropType === 2) && (
                <Field label="USDC Per Claim">
                  <input
                    type="number" min="0" step="0.01"
                    value={amountPerClaim}
                    onChange={e => setAmountPerClaim(e.target.value)}
                    placeholder="5.00"
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                    style={{ ...glass.inner, color: 'var(--ink)' }}
                  />
                </Field>
              )}

              {/* Min / Max MYSTERY */}
              {dropType === 1 && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min USDC">
                    <input
                      type="number" min="0" step="0.01"
                      value={minAmount}
                      onChange={e => setMinAmount(e.target.value)}
                      placeholder="1.00"
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                      style={{ ...glass.inner, color: 'var(--ink)' }}
                    />
                  </Field>
                  <Field label="Max USDC">
                    <input
                      type="number" min="0" step="0.01"
                      value={maxAmount}
                      onChange={e => setMaxAmount(e.target.value)}
                      placeholder="20.00"
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                      style={{ ...glass.inner, color: 'var(--ink)' }}
                    />
                  </Field>
                </div>
              )}

              {/* Max claimers */}
              <Field label={
                dropType === 0
                  ? 'Max Claimers — total wallets that can claim (optional)'
                  : 'Max Claimers — total wallets that can claim'
              }>
                <input
                  type="number" min="1" step="1"
                  value={maxClaims}
                  onChange={e => setMaxClaims(e.target.value)}
                  placeholder={dropType === 0 ? 'Unlimited' : '100'}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                  style={{ ...glass.inner, color: 'var(--ink)' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                  Each wallet can only claim once.
                </p>
              </Field>

              {/* Gating config */}
              {dropType === 2 && (
                <div
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: 'rgba(255,205,131,0.10)', border: '1px solid rgba(180,83,9,0.18)' }}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.09em]" style={{ color: '#b45309' }}>
                    Gating Rule
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GATING_OPTIONS.map(g => {
                      const sel = gatingType === g.value
                      return (
                        <button
                          key={g.value}
                          onClick={() => setGatingType(g.value)}
                          className="py-2 px-1 rounded-xl text-center text-xs font-bold transition-all"
                          style={{
                            background: sel ? 'rgba(255,205,131,0.35)' : 'rgba(255,255,255,0.6)',
                            border: sel ? '1.5px solid #b4530960' : '1.5px solid transparent',
                            color: sel ? '#b45309' : 'var(--ink-2)',
                          }}
                        >
                          {g.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>
                    {GATING_OPTIONS.find(g => g.value === gatingType)?.desc}
                  </p>

                  {gatingType === 1 && (
                    <div>
                      <label className="block text-xs font-bold mb-1.5 uppercase tracking-[0.09em]" style={{ color: 'var(--subtle)' }}>
                        Wallet Addresses (one per line)
                      </label>
                      <textarea
                        rows={4}
                        value={allowlistRaw}
                        onChange={e => setAllowlistRaw(e.target.value)}
                        placeholder={'0xAbc...\n0xDef...\n0x123...'}
                        className="w-full px-3 py-2.5 rounded-xl text-xs outline-none font-mono resize-none"
                        style={{ ...glass.inner, color: 'var(--ink)' }}
                      />
                      <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                        {allowlistRaw.split('\n').filter(a => /^0x[0-9a-fA-F]{40}$/.test(a.trim())).length} valid address(es)
                      </p>
                    </div>
                  )}

                  {(gatingType === 2 || gatingType === 3) && (
                    <Field label={gatingType === 2 ? 'NFT Contract Address' : 'Token Contract Address'}>
                      <input
                        type="text"
                        value={gatingContract}
                        onChange={e => setGatingContract(e.target.value)}
                        placeholder="0x..."
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none font-mono"
                        style={{ ...glass.inner, color: 'var(--ink)' }}
                      />
                    </Field>
                  )}

                  {gatingType === 3 && (
                    <Field label="Minimum Token Balance Required">
                      <input
                        type="number" min="1" step="1"
                        value={gatingMinBalance}
                        onChange={e => setGatingMinBalance(e.target.value)}
                        placeholder="1"
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                        style={{ ...glass.inner, color: 'var(--ink)' }}
                      />
                    </Field>
                  )}
                </div>
              )}

              {/* Expiry */}
              <Field label="Expires In (days, optional)">
                <input
                  type="number" min="1" step="1"
                  value={expiryDays}
                  onChange={e => setExpiryDays(e.target.value)}
                  placeholder="Never"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none tabular-nums"
                  style={{ ...glass.inner, color: 'var(--ink)' }}
                />
              </Field>

              {/* Error */}
              {error && (
                <div
                  className="flex items-center gap-2 text-xs p-3 rounded-xl"
                  style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
                >
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              {/* Step status */}
              {busy && (
                <div
                  className="flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium"
                  style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
                >
                  <Loader2 size={13} className="animate-spin" />
                  {step === 'approving'
                    ? (approvePending ? 'Approve USDC in wallet…' : 'Waiting for approval…')
                    : (createPending ? 'Confirm in wallet…' : 'Creating drop…')}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleSubmit}
                disabled={busy}
                className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  boxShadow: busy ? 'none' : '0 4px 16px rgba(18,45,69,0.22)',
                }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Working…
                  </span>
                ) : 'Create Drop'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5 uppercase tracking-[0.09em] leading-relaxed" style={{ color: 'var(--subtle)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
