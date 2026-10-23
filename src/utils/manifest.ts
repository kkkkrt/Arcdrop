/**
 * manifest.ts
 *
 * Loads the private claim manifest and looks up a recipient's proof + amount.
 *
 * PRIVACY MODEL
 * -------------
 * The manifest contains every recipient's address, individual allocation, and
 * Merkle proof.  It MUST NOT be bundled into the frontend JS or committed to a
 * public repo.  Distribute it through one of:
 *
 *   1. A signed URL (S3, GCS, R2) — valid only for the claim window.
 *   2. A server-side API route that authenticates the requester and returns
 *      only their own proof (never the full list).
 *   3. A private IPFS CID shared only with participants.
 *
 * The manifest URL is read from:
 *   VITE_CLAIM_MANIFEST_URL   (for static hosting)
 *   NEXT_PUBLIC_CLAIM_MANIFEST_URL   (for Next.js-adjacent hosts)
 *
 * If neither is set the loader falls back to /claim-manifest.json served from
 * the same origin (useful for development — place the file in /public/).
 *
 * MANIFEST FORMAT
 * ---------------
 * {
 *   "campaignId": "my-campaign-v1",   // optional, for cross-campaign replay checks
 *   "dropId": 3,                      // numeric drop id on-chain
 *   "token": "0x…",                   // ERC-20 token address
 *   "decimals": 6,
 *   "merkleRoot": "0x…",
 *   "recipients": [
 *     {
 *       "address": "0xalice…",
 *       "amount": "10000000",          // base units as a decimal string
 *       "proof": ["0x…", "0x…"]
 *     }
 *   ]
 * }
 *
 * SECURITY NOTE
 * -------------
 * The manifest proof is validated client-side before sending the transaction
 * (verifyProof in merkle.ts) AND validated on-chain by the contract.  A
 * corrupted or attacker-supplied manifest cannot cause an invalid claim to
 * succeed — the contract is authoritative.
 */

import { verifyProof, makeLeaf } from './merkle'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ManifestEntry {
  address: string          // lowercase 0x…
  amount: bigint           // base units
  proof: `0x${string}`[]
}

export interface ClaimManifest {
  campaignId?: string
  dropId: number
  token: string
  decimals: number
  merkleRoot: `0x${string}`
  recipients: ManifestEntry[]
}

/** Raw JSON shape before we convert amount strings to bigint */
interface RawManifest {
  campaignId?: string
  dropId: number
  token: string
  decimals: number
  merkleRoot: string
  recipients: Array<{
    address: string
    amount: string
    proof: string[]
  }>
}

// ── Cache ─────────────────────────────────────────────────────────────────────

/** In-memory cache keyed by manifest URL to avoid repeated fetches. */
const _cache = new Map<string, ClaimManifest>()

// ── Manifest URL resolution ───────────────────────────────────────────────────

function _manifestUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>
  return (
    env['VITE_CLAIM_MANIFEST_URL'] ??
    env['NEXT_PUBLIC_CLAIM_MANIFEST_URL'] ??
    '/claim-manifest.json'
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the claim manifest.
 * Result is cached for the lifetime of the page.
 *
 * Throws a `ManifestError` with a human-readable message on any failure.
 */
export async function loadManifest(url?: string): Promise<ClaimManifest> {
  const resolvedUrl = url ?? _manifestUrl()

  if (_cache.has(resolvedUrl)) return _cache.get(resolvedUrl)!

  let raw: RawManifest
  try {
    const res = await fetch(resolvedUrl)
    if (!res.ok) {
      if (res.status === 404) throw new ManifestError('Claim manifest not found (404). The campaign operator has not published the manifest yet.')
      if (res.status === 403) throw new ManifestError('Access to the claim manifest was denied (403). You may need a valid signed URL.')
      throw new ManifestError(`Failed to load claim manifest (HTTP ${res.status}).`)
    }
    raw = (await res.json()) as RawManifest
  } catch (e) {
    if (e instanceof ManifestError) throw e
    throw new ManifestError(`Network error loading claim manifest: ${(e as Error).message}`)
  }

  const manifest = _parseManifest(raw)
  _cache.set(resolvedUrl, manifest)
  return manifest
}

/**
 * Look up a single recipient's proof and amount.
 *
 * Returns null when the address is not in the manifest (ineligible).
 * The caller should NOT expose a different error message for "not found"
 * vs "invalid proof" — both should appear as "not eligible" to the user
 * to avoid leaking information about who IS in the list.
 */
export function lookupRecipient(
  manifest: ClaimManifest,
  address: string
): ManifestEntry | null {
  const lower = address.toLowerCase()
  return manifest.recipients.find(r => r.address === lower) ?? null
}

/**
 * Validate a recipient's proof client-side against the manifest root.
 *
 * Returns true only when the proof is cryptographically valid for the
 * given address and amount against the manifest's Merkle root.
 *
 * This does NOT replace the on-chain check — it is a pre-flight guard
 * to give the user a clear error before they pay gas.
 */
export function validateProof(
  manifest: ClaimManifest,
  address: string,
  amount: bigint,
  proof: `0x${string}`[]
): boolean {
  const leaf = makeLeaf(address.toLowerCase(), amount)
  return verifyProof(proof, manifest.merkleRoot, leaf)
}

/**
 * Complete eligibility check: looks up the recipient, validates the proof,
 * and returns the entry if everything is consistent.
 *
 * Throws a ManifestError with a user-safe message on any inconsistency.
 */
export function assertEligible(
  manifest: ClaimManifest,
  address: string
): ManifestEntry {
  const entry = lookupRecipient(manifest, address)
  if (!entry) throw new ManifestError('This wallet is not eligible for this drop.')

  const valid = validateProof(manifest, address, entry.amount, entry.proof)
  if (!valid) throw new ManifestError('The proof for this wallet is invalid. The manifest may be corrupted.')

  return entry
}

// ── Error type ────────────────────────────────────────────────────────────────

export class ManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManifestError'
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _parseManifest(raw: RawManifest): ClaimManifest {
  if (!raw.recipients || !Array.isArray(raw.recipients)) {
    throw new ManifestError('Manifest is malformed: missing recipients array.')
  }
  if (!raw.merkleRoot || !/^0x[0-9a-fA-F]{64}$/.test(raw.merkleRoot)) {
    throw new ManifestError('Manifest is malformed: invalid merkleRoot.')
  }

  const recipients: ManifestEntry[] = raw.recipients.map((r, i) => {
    if (!r.address || !/^0x[0-9a-fA-F]{40}$/i.test(r.address)) {
      throw new ManifestError(`Manifest entry ${i}: invalid address "${r.address}".`)
    }
    if (!r.amount || !/^\d+$/.test(r.amount)) {
      throw new ManifestError(`Manifest entry ${i}: invalid amount "${r.amount}" (must be base-unit integer string).`)
    }
    if (!Array.isArray(r.proof)) {
      throw new ManifestError(`Manifest entry ${i}: proof must be an array.`)
    }
    return {
      address: r.address.toLowerCase(),
      amount: BigInt(r.amount),
      proof: r.proof as `0x${string}`[],
    }
  })

  return {
    campaignId: raw.campaignId,
    dropId: raw.dropId,
    token: raw.token,
    decimals: raw.decimals ?? 6,
    merkleRoot: raw.merkleRoot as `0x${string}`,
    recipients,
  }
}
