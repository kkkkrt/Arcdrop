# ArcDrop

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

USDC gifting and airdrop platform on Arc Testnet. Creators fund a drop with USDC and share a claim link. Claimers connect their wallet and receive USDC instantly. Supports Public (fixed amount), Mystery (random amount between min/max), and Gated drops (allowlist / NFT / token holder).

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| ArcDrop v4 (USDC-only, correct USDC addr) | Arc Testnet | `0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e` | [View](https://explorer.testnet.arc.io/address/0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e) |

Constructor args: `usdc=0x3600000000000000000000000000000000000000`, `feeRecipient=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`, `feeBps=0`, `initialOwner=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`

**Network switching:** controlled by the in-app toggle (stored in localStorage). Both contracts are live:
- Testnet: `0xe74eed5b3c06f9f2b96e7a6195277d35ff1e3d7e` (Arc Testnet, chain 5042002)
- Mainnet: `0xe06Bf3dBde2e9BbCae9df9d0075499fbF7621462` (Arc Mainnet, chain 5042) — deployed by user via Remix

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
