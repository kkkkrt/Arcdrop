# ArcDrop

**Send USDC to anyone with a single link.**

ArcDrop lets you create shareable claim links that deliver USDC directly from a smart contract to a recipient's wallet — no intermediary, no custodian, no account required.

Built with [Arc Studio](https://studio.arc.io) · Built by [@alphafeeed](https://x.com/alphafeeed)

---

## What it does

- **Create a drop** — fund it with USDC, set a name, max claimers, and an optional expiry
- **Share a link** — anyone with the link can claim their share in one transaction
- **Three drop types:**
  - **Public** — anyone with the link claims a fixed amount
  - **Mystery** — each claimer gets a random amount between a min and max you set
  - **Gated** — restrict claims to an allowlist (Merkle proof), NFT holders, or token holders
- **Refundable** — unclaimed USDC is always recoverable by the creator
- **Testnet / Mainnet toggle** — switch networks inside the app without changing code

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Onchain | Solidity 0.8.20, OpenZeppelin, Foundry |
| Wallet | wagmi v2, viem v2, ConnectKit |
| Chain | Arc (USDC as native gas token) |
| Merkle proofs | Custom sorted-pair keccak256 tree (client-side) |

---

## Deployed contracts

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet (5042002) | `0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e` | [View](https://explorer.testnet.arc.io/address/0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e) |
| Arc Mainnet (5042) | `0xe06Bf3dBde2e9BbCae9df9d0075499fbF7621462` | [View](https://explorer.arc.io/address/0xe06Bf3dBde2e9BbCae9df9d0075499fbF7621462) |

---

## Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Foundry](https://getfoundry.sh) (for contract compilation and tests)
- MetaMask or any EVM wallet browser extension

### Install

```bash
bun install
```

### Environment variables

Copy `env.example` to `.env` and fill in your values. Never commit `.env`.

| Variable | Required | Description |
|---|---|---|
| `VITE_ARCDROP_TESTNET_ADDRESS` | Yes | ArcDrop contract address on Arc Testnet |
| `VITE_ARCDROP_MAINNET_ADDRESS` | Yes (for mainnet) | ArcDrop contract address on Arc Mainnet |
| `VITE_ARC_NETWORK` | No | `testnet` (default) or `mainnet` |
| `VITE_BASE_PATH` | No | Base path for GitHub Pages (e.g. `/arcdrop/`) |
| `VITE_CLAIM_MANIFEST_URL` | No | URL of private claim manifest for gated drops |
| `NEXT_PUBLIC_ARCDROP_CONTRACT_ADDRESS` | No | Alternative prefix (resolved alongside VITE_) |

### Run locally

```bash
bun run dev
```

Opens at `http://localhost:5173`.

### Build for production

```bash
bun run build
```

Output goes to `dist/`. For GitHub Pages at a subpath, set `VITE_BASE_PATH=/your-repo-name/` before building.

### Run contract tests

```bash
bun run contracts:test
```

50 Foundry unit tests covering valid claims, invalid proofs, duplicate claims, expiry, refunds, pause/unpause, fuzz tests, and more.

### Lint and typecheck

```bash
bun run check
```

---

## Deploying your own contract

The production contract is `contracts/ArcDrop.sol`. To deploy on Arc Mainnet via Remix:

1. Paste `contracts/ArcDrop.sol` into [remix.ethereum.org](https://remix.ethereum.org)
2. Compile: Solidity `0.8.20+`, Optimization on, 200 runs
3. Deploy tab → **Injected Provider - MetaMask** → switch to Arc Mainnet (Chain ID `5042`, RPC `https://rpc.mainnet.arc.io`)
4. Constructor args:

| Field | Value |
|---|---|
| `_usdc` | `0x3600000000000000000000000000000000000000` |
| `_feeRecipient` | Your wallet address |
| `_feeBps` | `0` (or e.g. `50` for 0.5%) |
| `initialOwner` | Your wallet address |

5. Copy the deployed address and set `VITE_ARCDROP_MAINNET_ADDRESS` in `.env`

---

## Switching to mainnet in the app

The app has a built-in **Testnet / Mainnet** toggle in the header. When `VITE_ARCDROP_MAINNET_ADDRESS` is set, clicking "Mainnet" connects the app to your mainnet contract with no code changes needed.

---

## Project structure

```
contracts/
  ArcDrop.sol            # Production smart contract
  test/ArcDrop.t.sol     # Foundry unit tests (50 tests)
  test-helpers/          # MockERC20 for tests
src/
  components/
    Dashboard.tsx        # Create and manage drops
    ClaimPage.tsx        # Claim a drop via shared link
    CreateDropModal.tsx  # New drop form (Public / Mystery / Gated)
    AboutPage.tsx        # Project info, FAQ, contract addresses
    ConfigGuard.tsx      # Blocks UI when config is missing
  utils/
    arcdrop.ts           # ABI + contract address helper
    merkle.ts            # Client-side Merkle tree for gated drops
    manifest.ts          # Private claim manifest loader
  NetworkContext.tsx     # Testnet / Mainnet toggle (localStorage)
  contract-config.ts     # Network config, USDC addresses, chain IDs
  config.ts              # wagmi chain + client setup
```

---

## Security notes

- USDC is held by the contract, never by this app or any centralised wallet
- Each claimer address can claim at most once per drop (enforced on-chain)
- The contract has been reviewed with automated static analysis and 50 unit tests
- An independent professional audit is recommended before large mainnet deployments
- Private keys and seed phrases are never handled by this frontend

---

## License

MIT
