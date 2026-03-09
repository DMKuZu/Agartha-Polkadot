# Agartha — Context & Progress Status

> This file is updated every time a code change is made. Use it as the source of truth for current project state.

---

## Current Status: Days 15–16 of 21

**Phase:** Connecting UI to Deployed Contracts

The smart contracts are fully deployed on Sepolia testnet. The Next.js frontend has wallet connection, document hashing, and the case creation form wired to the factory contract. The current focus is completing the full UI-to-contract binding for all user flows.

---

## 3-Week Progress Tracker

### Week 1 — Smart Contract Architecture `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 1–2 | Multi-sig escrow + Ricardian hash storage | Done |
| 3–4 | CPRA compliance ledger contract | Done |
| 5   | Factory pattern contract | Done |
| 6–7 | Remix testing + Sepolia deployment + ABI export | Done |

**Deployed Contracts (Sepolia Testnet):**
- `LegalFactory`: `0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7`
- `CPRALedger`: `0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1`
- `LegalEscrow` — deployed per case via factory (no fixed address)

ABIs exported to: `legal-escrow-dapp/src/contracts/abis.ts`

---

### Week 2 — Frontend Foundation & Web3 Middleware `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 8–9   | Next.js project init, routing, layout | Done |
| 10–12 | Wagmi + viem + RainbowKit integration | Done |
| 13–14 | Ricardian engine — PDF upload + browser-side SHA256 hashing | Done |

**Key files built:**
- `src/app/layout.tsx` — root layout with Web3Provider wrapper
- `src/app/page.tsx` — main dashboard with case creation form
- `src/components/Web3Provider.tsx` — Wagmi + RainbowKit config (Hardhat localhost + Sepolia, SSR enabled)
- `src/components/RicardianUploader.tsx` — PDF upload → SHA256 → `0x`-prefixed hash

---

### Week 3 — System Assembly, Syncing, and Polish `[IN PROGRESS]`

| Day | Task | Status |
|-----|------|--------|
| 15–16 | Connect all UI buttons to contract functions | **In Progress** |
| 17    | `remixd` local file sync (optional) | Pending |
| 18–19 | End-to-end settlement simulation | Pending |
| 20–21 | UI polish, loading states, error handling, network guards | Pending |

---

## Days 15–16 — Remaining Work (Current Focus)

The factory `createCase()` call is already wired. The following flows still need UI-to-contract bindings:

### 1. Client Deposit Page
- Route needed: `/deposit` or dedicated dashboard section
- Must call `escrow.fund()` (payable) using the escrow address returned by `createCase()`
- New escrow address must be extracted via `useWaitForTransactionReceipt` + log parsing on `EscrowCreated` event

### 2. Multi-Sig Approval Flow
- UI needed for each party (buyer, seller, lawyer) to call `escrow.approveRelease()`
- Must show current `approvalCount` and whether the connected wallet `hasApproved`
- Funds auto-release to seller when `approvalCount >= 2`

### 3. CPRA Ledger Writes
- After `createCase()` → call `ledger.registerCase(bytes32 caseId, clientAddr, escrowAddr, purpose)`
- After `fund()` succeeds → call `ledger.recordDeposit()`
- After funds released → call `ledger.recordDisbursement()` then `ledger.closeCase()`

### 4. Lawyer Dashboard — Read State
- Display all deployed escrows via `factory.getDeployedEscrows()`
- Per escrow: read `buyer`, `seller`, `settlementAmount`, `documentHash`, `isFunded`, `isReleased`, `approvalCount`
- Display total case count via `ledger.getTotalCases()`

---

## File Map

```
legal-escrow-dapp/
├── src/
│   ├── app/
│   │   ├── layout.tsx              Root layout — Web3Provider wrapper
│   │   ├── page.tsx                Main dashboard — case creation form
│   │   └── globals.css
│   ├── components/
│   │   ├── Web3Provider.tsx        Wagmi + RainbowKit + TanStack Query config
│   │   └── RicardianUploader.tsx   PDF → SHA256 hash
│   └── contracts/
│       └── abis.ts                 All ABIs + deployed addresses

backend/
├── contracts/
│   ├── LegalEscrow.sol             2-of-3 multi-sig escrow + Ricardian hash
│   ├── LegalFactory.sol            Factory — deploys one LegalEscrow per case
│   ├── CPRALedger.sol              On-chain audit trail for CPRA compliance
│   └── Lock.sol                    Hardhat boilerplate (unused)
├── scripts/
│   └── deploy.js                   Deploys Factory + Ledger; auto-writes .env.local to frontend
├── hardhat.config.js               Solidity 0.8.28 + localhost network (chainId 31337)
└── test/
```

---

## Local Testing Setup (MetaMask + Hardhat)

### One-time MetaMask network setup
Add a custom network in MetaMask:
- **Network Name:** Hardhat Local
- **RPC URL:** `http://127.0.0.1:8545`
- **Chain ID:** `31337`
- **Currency Symbol:** `ETH`

### Every test session workflow
```bash
# Terminal 1 — start local blockchain (keep running)
cd backend
npx hardhat node

# Terminal 2 — deploy contracts (run after node is up)
npx hardhat run scripts/deploy.js --network localhost
# → prints addresses + writes legal-escrow-dapp/.env.local automatically

# Terminal 3 — start frontend
cd legal-escrow-dapp
npm run dev
```

### Import test wallets into MetaMask
`npx hardhat node` prints 20 accounts with private keys. Import **3 separate accounts** (one each for buyer, seller, lawyer) using their private keys via MetaMask → Import Account.

### Contract address resolution
`abis.ts` reads `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_LEDGER_ADDRESS` from `.env.local` first. Falls back to the Sepolia addresses if those vars are absent. No manual address editing needed after running the deploy script.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Smart Contracts | Solidity 0.8.28, Hardhat |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Web3 Hooks | Wagmi 2, viem 2 |
| Wallet UI | RainbowKit 2 |
| Data Fetching | TanStack React Query 5 |
| Document Hashing | crypto-js (browser-side SHA256) |
| Network | Hardhat localhost (chainId 31337) + Sepolia testnet |

---

## Smart Contract Summary

### LegalEscrow.sol
- State: `buyer`, `seller`, `lawyer`, `settlementAmount`, `documentHash`, `isFunded`, `isReleased`, `approvalCount`, `hasApproved(address)`
- `fund()` — buyer deposits exact settlement amount (payable)
- `approveRelease()` — any party approves; auto-releases funds at 2/3
- `onlyParties` modifier restricts all calls

### LegalFactory.sol
- `createCase(buyer, seller, lawyer, amount, documentHash)` → deploys `LegalEscrow`, returns address
- `getDeployedEscrows()` → `address[]`
- Event: `EscrowCreated(escrowAddress, buyer, seller)`

### CPRALedger.sol
- Owner: `lawFirmAdmin`
- `registerCase()`, `recordDeposit()`, `recordDisbursement()`, `closeCase()`
- `mapping(bytes32 => CaseRecord)` — tracks clientId, escrowContract, depositedAmount, disbursedAmount, isClosed, purpose

---

## Key Wagmi Hooks in Use

```typescript
useAccount()                      // connected wallet address + isConnected
useWriteContract()                // send txns: createCase, fund, approveRelease
useWaitForTransactionReceipt()    // parse EscrowCreated log to get new escrow address
useReadContract()                 // read escrow/ledger/factory state
```

---

## Week 3 Checklist

- [ ] Parse `EscrowCreated` log to extract deployed escrow address after `createCase()`
- [ ] Build `fund()` UI — client deposit page
- [ ] Build `approveRelease()` UI — per-party approval with live approval count
- [ ] Wire CPRA ledger: `registerCase` → `recordDeposit` → `recordDisbursement` → `closeCase`
- [ ] Build lawyer dashboard read view — list all cases with status
- [ ] End-to-end settlement simulation (Days 18–19)
- [ ] Loading states + tx success/failure toasts
- [ ] Wrong-network guard (enforce Sepolia)
- [ ] Display ETH amounts in readable fiat-friendly format

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-10 | Initial CONTEXT_STATUS.md created. Days 15–16 in progress. |
| 2026-03-10 | Local testing setup: added `backend/scripts/deploy.js`, `hardhat.config.js` localhost network, `hardhat` chain to `Web3Provider.tsx`, env var address resolution in `abis.ts`. |
