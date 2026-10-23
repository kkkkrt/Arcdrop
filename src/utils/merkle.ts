/**
 * merkle.ts
 *
 * Pure-TypeScript Merkle tree for ArcDrop ALLOWLIST drops.
 *
 * Leaf encoding matches the Solidity contract exactly:
 *   leaf = keccak256(abi.encodePacked(address, uint256))
 *
 * The tree uses sorted-pair hashing (same as OpenZeppelin MerkleProof.sol)
 * so proofs are compatible with _verifyMerkleProof in ArcDrop.sol.
 *
 * Usage — generating a root + proofs for a campaign:
 *
 *   import { buildMerkleTree, getProof } from '@/utils/merkle'
 *
 *   const entries = [
 *     { address: '0xAlice…', amount: 10_000000n },  // 10 USDC (6 dec)
 *     { address: '0xBob…',   amount: 25_000000n },
 *   ]
 *   const tree   = buildMerkleTree(entries)
 *   const root   = tree.root          // pass to createDrop as merkleRoot
 *   const proof  = getProof(tree, '0xAlice…', 10_000000n)
 *
 * Usage — verifying a proof client-side before sending a transaction:
 *
 *   import { verifyProof, makeLeaf } from '@/utils/merkle'
 *   const valid = verifyProof(proof, root, makeLeaf('0xAlice…', 10_000000n))
 */

import { keccak256, encodePacked } from 'viem'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MerkleEntry {
  address: string   // checksummed or lowercase 0x… address
  amount: bigint    // in token base units (wei / micro-USDC etc.)
}

export interface MerkleTree {
  root: `0x${string}`
  /** Ordered leaves (index matches entry order after sorting) */
  leaves: `0x${string}`[]
  /** All tree layers, layers[0] = leaves, layers[last] = [root] */
  layers: `0x${string}`[][]
  /** Original entries in the same order as leaves */
  entries: MerkleEntry[]
}

// ── Leaf construction ─────────────────────────────────────────────────────────

/**
 * Compute the leaf for a single recipient.
 * Matches: keccak256(abi.encodePacked(address, uint256))
 */
export function makeLeaf(address: string, amount: bigint): `0x${string}` {
  return keccak256(
    encodePacked(['address', 'uint256'], [address as `0x${string}`, amount])
  )
}

// ── Tree construction ─────────────────────────────────────────────────────────

/**
 * Build a Merkle tree from an array of (address, amount) entries.
 *
 * Entries are sorted by leaf hash before building so the tree is
 * deterministic regardless of input order.
 */
export function buildMerkleTree(entries: MerkleEntry[]): MerkleTree {
  if (entries.length === 0) {
    throw new Error('Cannot build a Merkle tree from an empty list')
  }

  // Deduplicate by lowercased address
  const seen = new Set<string>()
  const deduped: MerkleEntry[] = []
  for (const e of entries) {
    const key = e.address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ address: e.address.toLowerCase(), amount: e.amount })
  }

  // Build leaves and sort deterministically
  const indexed = deduped.map(e => ({ entry: e, leaf: makeLeaf(e.address, e.amount) }))
  indexed.sort((a, b) => (a.leaf < b.leaf ? -1 : a.leaf > b.leaf ? 1 : 0))

  const sortedEntries = indexed.map(i => i.entry)
  const leaves        = indexed.map(i => i.leaf)

  const layers: `0x${string}`[][] = [leaves]

  // Build each layer up to the root
  let current: `0x${string}`[] = leaves
  while (current.length > 1) {
    const next: `0x${string}`[] = []
    for (let i = 0; i < current.length; i += 2) {
      const left  = current[i]
      const right = i + 1 < current.length ? current[i + 1] : current[i] // odd node duplicates
      next.push(_hashPair(left, right))
    }
    layers.push(next)
    current = next
  }

  return {
    root: current[0],
    leaves,
    layers,
    entries: sortedEntries,
  }
}

// ── Proof generation ──────────────────────────────────────────────────────────

/**
 * Get the Merkle proof for a specific (address, amount) pair.
 * Returns null if the entry is not found in the tree.
 */
export function getProof(
  tree: MerkleTree,
  address: string,
  amount: bigint
): `0x${string}`[] | null {
  const targetLeaf = makeLeaf(address.toLowerCase(), amount)
  let idx = tree.leaves.indexOf(targetLeaf)
  if (idx === -1) return null

  const proof: `0x${string}`[] = []
  for (let layer = 0; layer < tree.layers.length - 1; layer++) {
    const currentLayer = tree.layers[layer]
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1

    if (siblingIdx < currentLayer.length) {
      proof.push(currentLayer[siblingIdx])
    }
    // Move to parent index
    idx = Math.floor(idx / 2)
  }

  return proof
}

// ── Proof verification ────────────────────────────────────────────────────────

/**
 * Verify a Merkle proof client-side.
 * Uses the same sorted-pair hashing as the Solidity contract.
 */
export function verifyProof(
  proof: `0x${string}`[],
  root: `0x${string}`,
  leaf: `0x${string}`
): boolean {
  let computed: `0x${string}` = leaf
  for (const el of proof) {
    computed = _hashPair(computed, el)
  }
  return computed.toLowerCase() === root.toLowerCase()
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into MerkleEntry[].
 *
 * Expected format (header row optional):
 *   address,amount
 *   0xAlice…,10.00
 *   0xBob…,25.00
 *
 * `decimals` is used to convert the human-readable amount to base units.
 * Default 6 (USDC). Pass 18 for most ERC-20 tokens.
 *
 * Throws on malformed rows.  Skips blank lines and comment lines (#).
 */
export function parseCsv(csv: string, decimals = 6): MerkleEntry[] {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))

  // Detect and skip header row
  const startIdx = /^address/i.test(lines[0]) ? 1 : 0

  const entries: MerkleEntry[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim())
    if (parts.length < 2) throw new Error(`Row ${i + 1}: expected "address,amount" columns`)

    const addr = parts[0]
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      throw new Error(`Row ${i + 1}: invalid address "${addr}"`)
    }

    const amountStr = parts[1]
    if (!/^\d+(\.\d+)?$/.test(amountStr)) {
      throw new Error(`Row ${i + 1}: invalid amount "${amountStr}"`)
    }

    entries.push({ address: addr.toLowerCase(), amount: _parseDecimal(amountStr, decimals) })
  }

  if (entries.length === 0) throw new Error('CSV contains no valid entries')
  return entries
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  return a <= b
    ? keccak256(encodePacked(['bytes32', 'bytes32'], [a, b]))
    : keccak256(encodePacked(['bytes32', 'bytes32'], [b, a]))
}

/** Convert a decimal string like "10.50" to base units (bigint). */
function _parseDecimal(value: string, decimals: number): bigint {
  const [intPart, fracPart = ''] = value.split('.')
  const frac = (fracPart + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(frac)
}
