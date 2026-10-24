import React, { useState } from 'react'
import {
  Gift, Lock, Zap, Eye, Users, ShieldCheck,
  ArrowRight, Globe, ArrowLeft, ChevronDown, ExternalLink,
  Wallet, Copy, Check,
} from 'lucide-react'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(28px) saturate(190%)',
  WebkitBackdropFilter: 'blur(28px) saturate(190%)',
  border: '1px solid rgba(255,255,255,0.72)',
  boxShadow: '0 8px 40px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
}

const STEPS = [
  {
    n: '01',
    title: 'Creator funds a drop',
    body: 'Connect your wallet, approve USDC, and create a drop with a name, amount, and optional expiry. The USDC is held by the smart contract — not by us.',
  },
  {
    n: '02',
    title: 'Share the claim link',
    body: 'Copy the generated link and share it anywhere — Twitter, Discord, email, or QR code. Each link encodes the drop ID.',
  },
  {
    n: '03',
    title: 'Recipient connects and claims',
    body: 'The recipient opens the link, connects their wallet, and clicks Claim. The contract verifies eligibility and sends USDC directly to their wallet in one transaction.',
  },
  {
    n: '04',
    title: 'Unused funds are refundable',
    body: 'If some wallets never claim, the creator can refund the remaining balance at any time — nothing is locked forever.',
  },
]

const DROP_TYPES = [
  {
    icon: <Globe size={18} />,
    color: 'rgba(133,177,237,0.18)',
    textColor: '#1061a6',
    name: 'Public',
    desc: 'Anyone with the link can claim a fixed USDC amount, up to the max number of claimers you set.',
  },
  {
    icon: <Eye size={18} />,
    color: 'rgba(175,143,244,0.18)',
    textColor: '#7c3aed',
    name: 'Mystery',
    desc: 'Each claimer receives a random USDC amount between a min and max you define. Good for surprise rewards.',
  },
  {
    icon: <Lock size={18} />,
    color: 'rgba(255,205,131,0.22)',
    textColor: '#b45309',
    name: 'Gated',
    desc: 'Restrict claims to an allowlist (Merkle proof), NFT holders, or token holders. Per-recipient amounts supported.',
  },
]

const FEATURES = [
  { icon: <ShieldCheck size={16} />, label: 'Non-custodial', desc: 'USDC lives in the audited smart contract, not in any centralised wallet.' },
  { icon: <Zap size={16} />, label: 'Instant settlement', desc: 'Claims settle on Arc in sub-second finality — no waiting for confirmations.' },
  { icon: <Users size={16} />, label: 'Any wallet', desc: 'Works with MetaMask and any injected EVM wallet. No account or sign-up required.' },
  { icon: <Gift size={16} />, label: 'Refundable', desc: 'Unclaimed USDC is always recoverable by the creator — no funds locked forever.' },
  { icon: <Wallet size={16} />, label: 'USDC native', desc: 'Built on Arc where USDC is the native gas token — no ETH needed to send or receive.' },
  { icon: <Globe size={16} />, label: 'No account needed', desc: 'Recipients only need a wallet address. No registration, KYC, or email required.' },
]

const FAQ = [
  {
    q: 'Do I need ETH or any other token?',
    a: 'No. Arc uses USDC as its native gas token. All transactions — creating drops, claiming, and refunding — are paid in USDC. You never need ETH or any other token.',
  },
  {
    q: 'Is the smart contract audited?',
    a: 'The contract has been reviewed with automated static analysis and a comprehensive test suite (50 unit tests covering all edge cases). An independent professional audit is recommended before large mainnet deployments.',
  },
  {
    q: 'What happens if a recipient never claims?',
    a: 'The creator can call Refund at any time to recover all unclaimed USDC from the contract. Nothing is ever permanently locked.',
  },
  {
    q: 'Can I set an expiry date?',
    a: 'Yes. When creating a drop you can set an expiry timestamp. After expiry, no new claims are accepted and the creator can refund the remaining balance.',
  },
  {
    q: 'What is a Gated drop?',
    a: 'A Gated drop restricts who can claim. You can gate by allowlist (a list of specific wallet addresses you upload), NFT ownership (must hold at least one NFT from a given contract), or token balance (must hold at least a minimum amount of a given token).',
  },
  {
    q: 'What is a Mystery drop?',
    a: 'A Mystery drop pays a random USDC amount to each claimer, between a minimum and maximum you define when creating the drop. Amounts are derived on-chain and cannot be predicted.',
  },
  {
    q: 'Can someone claim more than once?',
    a: 'No. The smart contract tracks every claimer address per drop. A second claim attempt from the same wallet will revert with an "Already Claimed" error.',
  },
  {
    q: 'What is the platform fee?',
    a: 'The fee is set at contract deployment. The current deployed contracts use 0% fee — the full funded amount goes to claimers.',
  },
]

const CONTRACTS = [
  {
    label: 'Arc Testnet',
    chainId: 5042002,
    address: '0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e',
    explorerBase: 'https://explorer.testnet.arc.io',
    color: 'rgba(133,177,237,0.12)',
    badgeColor: 'rgba(18,45,69,0.1)',
    badgeText: 'var(--accent)',
  },
  {
    label: 'Arc Mainnet',
    chainId: 5042,
    address: '0xe06Bf3dBde2e9BbCae9df9d0075499fbF7621462',
    explorerBase: 'https://explorer.arc.io',
    color: 'rgba(26,128,71,0.08)',
    badgeColor: 'rgba(26,128,71,0.12)',
    badgeText: 'var(--success)',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all cursor-pointer"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{q}</p>
        <ChevronDown
          size={16}
          strokeWidth={2.5}
          style={{
            color: 'var(--subtle)',
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{a}</p>
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:scale-[1.04] active:scale-[0.96]"
      style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}
    >
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

interface Props {
  onBack?: () => void
}

export default function AboutPage({ onBack }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-5 pt-4 pb-24">

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold mb-4 transition-all hover:scale-[1.02] active:scale-[0.97]"
          style={{ color: 'var(--subtle)' }}
        >
          <ArrowLeft size={15} strokeWidth={2.5} />
          Back to Dashboard
        </button>
      )}

      {/* Hero */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div style={{ height: 3, background: spectral }} />
        <div className="p-8">
          <div
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(18,45,69,0.07)', color: 'var(--subtle)' }}
          >
            <Gift size={12} />
            USDC Drop Links on Arc
          </div>
          <h1
            className="display text-4xl font-bold tracking-tight mb-3"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Send USDC to anyone<br />with a single link
          </h1>
          <p className="text-base max-w-xl" style={{ color: 'var(--muted)', lineHeight: 1.65 }}>
            ArcDrop lets you create shareable claim links that send USDC directly from a smart contract to a recipient's wallet — no intermediary, no custodian, no account needed.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.97]"
              style={{ background: 'var(--accent)', color: 'white', boxShadow: '0 2px 12px rgba(18,45,69,0.18)' }}
            >
              Go to Dashboard
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] mb-5" style={{ color: 'var(--subtle)' }}>
            How it works
          </p>
          <div className="space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.n} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black tabular-nums"
                    style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}
                  >
                    {step.n}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px flex-1 my-1" style={{ background: 'var(--border)', minHeight: 20 }} />
                  )}
                </div>
                <div className="pb-5 flex-1 min-w-0">
                  <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>{step.title}</p>
                  <p className="text-sm" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drop types */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] mb-4" style={{ color: 'var(--subtle)' }}>
            Drop types
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DROP_TYPES.map(t => (
              <div key={t.name} className="rounded-2xl p-4" style={{ background: t.color }}>
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(255,255,255,0.6)', color: t.textColor }}
                >
                  {t.icon}
                </div>
                <p className="font-bold text-sm mb-1.5" style={{ color: 'var(--ink)' }}>{t.name}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key features */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] mb-4" style={{ color: 'var(--subtle)' }}>
            Key features
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div
                key={f.label}
                className="flex items-start gap-3 rounded-2xl p-4"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
              >
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}
                >
                  {f.icon}
                </div>
                <div>
                  <p className="font-bold text-sm mb-0.5" style={{ color: 'var(--ink)' }}>{f.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contract addresses */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] mb-4" style={{ color: 'var(--subtle)' }}>
            Smart contract addresses
          </p>
          <div className="space-y-3">
            {CONTRACTS.map(c => (
              <div
                key={c.chainId}
                className="rounded-2xl p-4"
                style={{ background: c.color, border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: c.badgeColor, color: c.badgeText }}
                  >
                    {c.label}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--subtle)' }}
                  >
                    Chain ID {c.chainId}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code
                    className="text-xs font-mono flex-1 min-w-0 truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {c.address}
                  </code>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <CopyButton text={c.address} />
                    <a
                      href={`${c.explorerBase}/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all hover:scale-[1.04] active:scale-[0.96]"
                      style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--subtle)' }}
                    >
                      <ExternalLink size={11} strokeWidth={2.5} />
                      Explorer
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="rounded-3xl overflow-hidden mb-5" style={glass}>
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-[0.1em] mb-4" style={{ color: 'var(--subtle)' }}>
            Frequently asked questions
          </p>
          <div className="space-y-2">
            {FAQ.map(item => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </div>

      {/* Built on Arc + CTA */}
      <div className="rounded-3xl overflow-hidden" style={glass}>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
            <div>
              <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>Built on Arc</p>
              <p className="text-xs max-w-xs" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Arc is a blockchain where USDC is the native gas token — no ETH needed. Transactions cost fractions of a cent and settle in under a second.
              </p>
            </div>
            <a
              href="https://arc.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97]"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Learn about Arc
              <ArrowRight size={13} strokeWidth={2.5} />
            </a>
          </div>

          {/* Built by */}
          <div
            className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-3"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Built by
            </span>
            <a
              href="https://x.com/alphafeeed"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
              style={{ color: 'var(--ink)' }}
            >
              {/* X / Twitter logo */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @alphafeeed
            </a>
          </div>

          {/* Back to dashboard CTA strip */}
          {onBack && (
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{
                background: 'rgba(18,45,69,0.06)',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
              }}
            >
              <ArrowLeft size={14} strokeWidth={2.5} />
              Back to Dashboard — create or claim a drop
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
