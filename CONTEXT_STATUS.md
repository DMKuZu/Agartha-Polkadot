# Agartha — Context & Progress Status

> This file is updated every time a code change is made. Use it as the source of truth for current project state.

---

## Current Status: Day 18 of 21

**Phase:** PRD Alignment — Role-based UX + Ricardian Generator + Paseo Network

Full settlement flow confirmed working on Hardhat local (Day 17). Now restructuring the app to match the PRD: role-differentiated pages (Client / Freelancer / Arbiter), onboarding/role-selection landing, Ricardian template generator replacing the PDF uploader, and Polkadot Paseo Testnet network support.

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

### Week 3 — System Assembly, Syncing, and Polish `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 15–16 | Connect all UI buttons to contract functions | Done |
| 17    | Lawyer dashboard read view + polish | Done |
| 18–19 | End-to-end settlement simulation | Done — confirmed working |
| 20–21 | UI polish, loading states, error handling, network guards | Done |

---

### Week 4 — PRD Alignment `[IN PROGRESS]`

| Phase | Task | Status |
|-------|------|--------|
| 1 | Network config: add Paseo Testnet to Web3Provider + ETH→PAS labels | In Progress |
| 1 | Terminology rename: Buyer→Client, Seller→Freelancer, Lawyer→Arbiter | Pending |
| 2 | Onboarding page (`/`) — connect wallet + role selector (Client / Freelancer / Arbiter) | Pending |
| 2 | Role routing: `/client`, `/freelancer`, `/arbiter` pages + `RoleGuard` component | Pending |
| 3 | `RicardianGenerator.tsx` — Philippine FSA template form → auto-hash (replaces PDF uploader) | Pending |
| 4 | Client page (`/client`) — create deal → submit for Arbiter review → fund → approve | Pending |
| 5 | Freelancer page (`/freelancer`) — view contracts → approve release → settlement received | Pending |
| 6 | Arbiter page (`/arbiter`) — pending deals queue + review + deploy + CPRA ledger | Pending |

---

## File Map

```
legal-escrow-dapp/
├── src/
│   ├── app/
│   │   ├── layout.tsx                Root layout — Web3Provider wrapper
│   │   ├── page.tsx                  Onboarding — wallet connect + role selector
│   │   ├── arbiter/
│   │   │   └── page.tsx              Arbiter workflow — pending review queue, deploy, CPRA ledger
│   │   ├── client/
│   │   │   └── page.tsx              Client workflow — create deal, fund escrow, approve
│   │   ├── freelancer/
│   │   │   └── page.tsx              Freelancer workflow — view contracts, approve release
│   │   ├── dashboard/
│   │   │   └── page.tsx              Shared read-only all-cases view (all roles)
│   │   └── globals.css
│   ├── components/
│   │   ├── Web3Provider.tsx          Wagmi + RainbowKit + TanStack Query config (Hardhat + Sepolia + Paseo)
│   │   ├── RoleGuard.tsx             localStorage role guard — redirects unauthenticated users to onboarding
│   │   └── RicardianGenerator.tsx    Philippine FSA template form → rendered doc → SHA256 hash
│   └── contracts/
│       └── abis.ts                   All ABIs + deployed addresses

backend/
├── contracts/
│   ├── LegalEscrow.sol               2-of-3 multi-sig escrow + Ricardian hash
│   ├── LegalFactory.sol              Factory — deploys one LegalEscrow per case
│   ├── CPRALedger.sol                On-chain audit trail for CPRA compliance
│   └── Lock.sol                      Hardhat boilerplate (unused)
├── scripts/
│   └── deploy.js                     Deploys Factory + Ledger; auto-writes .env.local to frontend
├── hardhat.config.js                 Solidity 0.8.28 + localhost network (chainId 31337)
└── test/
```

---

## localStorage Keys (Role Coordination — No Backend)

| Key | Written by | Read by | Content |
|-----|-----------|---------|---------|
| `agartha_role` | Onboarding page | RoleGuard, all pages | `'client' \| 'freelancer' \| 'arbiter'` |
| `agartha_pending_deals` | Client page | Arbiter page | `Array<{ id, clientAddress, freelancerAddress, amount, documentHash, title, deliverables, deadline }>` |
| `agartha_escrow_map` | Arbiter page (after deploy) | Client page | `Record<dealId, escrowAddress>` |

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
`npx hardhat node` prints 20 accounts with private keys. Import **3 separate accounts** (one each for Client, Freelancer, Arbiter) using their private keys via MetaMask → Import Account.

### Contract address resolution
`abis.ts` reads `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_LEDGER_ADDRESS` from `.env.local` first. Falls back to the Sepolia addresses if those vars are absent. No manual address editing needed after running the deploy script.

### MetaMask nonce reset (required after every `hardhat node` restart)
When `npx hardhat node` restarts, the chain resets to block 0 but MetaMask still caches the old nonce for each Hardhat test account. This causes all transactions from those accounts to hang silently.

**Fix — do this for every Hardhat test account imported into MetaMask:**
MetaMask → click the account → three-dot menu → Settings → Advanced → **Clear activity and nonce data**

Do this once per `npx hardhat node` session before submitting any transactions.

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
| Network | Hardhat localhost (31337) + Sepolia testnet + Polkadot EVM Testnet (420420417) |

---

## Smart Contract Summary

### LegalEscrow.sol
- State: `buyer`, `seller`, `lawyer`, `settlementAmount`, `documentHash`, `isFunded`, `isReleased`, `approvalCount`, `hasApproved(address)`
- `fund()` — buyer (Client) deposits exact settlement amount (payable)
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
useReadContracts()                // batch read multiple escrow fields
useChainId()                      // current chain
useSwitchChain()                  // network guard
```

---

## Week 3 Checklist `[ALL DONE]`

- [x] Parse `EscrowCreated` log to extract deployed escrow address after `createCase()`
- [x] Build `fund()` UI — client deposit page
- [x] Build `approveRelease()` UI — per-party approval with live approval count
- [x] Wire CPRA ledger: `registerCase` → `recordDeposit` → `recordDisbursement` → `closeCase`
- [x] Build lawyer dashboard read view — list all cases with status
- [x] End-to-end settlement simulation — confirmed working
- [x] Loading states + tx success/failure toasts
- [x] Wrong-network guard (enforce Sepolia or Hardhat)
- [x] Display ETH amounts in readable fiat-friendly format

## Week 4 Checklist `[COMPLETE]`

- [x] Add Paseo Testnet chain to Web3Provider (chain ID 420420417, Polkadot EVM Testnet)
- [x] Rename Buyer→Client, Seller→Freelancer, Lawyer→Arbiter in UI labels
- [x] Update ETH→PAS currency label in UI
- [x] Build onboarding/role-selector landing page (`/`)
- [x] Build `RoleGuard` component
- [x] Build `RicardianGenerator` component (Philippine FSA template → hash)
- [x] Delete `RicardianUploader` component (replaced)
- [x] Build Client page (`/client`)
- [x] Build Freelancer page (`/freelancer`)
- [x] Build Arbiter page (`/arbiter`) with pending deals queue
- [x] Update `README.md` with new role-based flow

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-10 | Initial CONTEXT_STATUS.md created. Days 15–16 in progress. |
| 2026-03-10 | Local testing setup: added `backend/scripts/deploy.js`, `hardhat.config.js` localhost network, `hardhat` chain to `Web3Provider.tsx`, env var address resolution in `abis.ts`. |
| 2026-03-11 | Created `requirements.md` with all library versions. Updated `README.md` with local + Sepolia testing instructions and end-to-end settlement flow. |
| 2026-03-11 | Fixed `page.tsx`: address args now cast as `0x${string}`, added `isAddress` validation, inline address format errors, transaction error surface via `isError`/`error.message`, lawyer address displayed in UI. Added MetaMask nonce reset instructions to local testing section. |
| 2026-03-11 | Completed Days 15–16 core wiring in `page.tsx`: `parseEventLogs` extracts escrow address from `EscrowCreated` receipt, `fund()` deposit section (Step 3), `approveRelease()` with live dot-progress indicator and per-wallet approval guard (Step 4), settlement complete screen (Step 5). Separate `useWriteContract` and `useWaitForTransactionReceipt` hooks for factory vs escrow. All escrow state refetches on tx confirmation. |
| 2026-03-11 | Wired CPRA Ledger (Step 6) in `page.tsx`: 3rd `useWriteContract`/`useWaitForTransactionReceipt` for ledger txns; `lawFirmAdmin` read + `isAdmin` guard; deterministic `caseId = keccak256(escrowAddress)`; `casePurpose` form field; `ledgerDone` step-tracking state advanced by `useEffect` after each confirmed ledger tx; `LedgerStepRow` inline component; 4-step sequential UI (Register → Deposit → Disbursement → Close) with amber admin warning banner. Fixed TypeScript `unknown` → `ReactNode` error by casting all `useReadContract` data to explicit types. |
| 2026-03-11 | Fixed `Web3Provider.tsx`: added explicit `transports` to `getDefaultConfig` — `hardhat` chain now uses `http('http://127.0.0.1:8545')`, `sepolia` uses `http()`. Without this, wagmi polled WalletConnect's cloud RPC for receipts instead of localhost, causing `useWaitForTransactionReceipt` to never resolve on Hardhat. |
| 2026-03-11 | Built lawyer dashboard at `/dashboard` (`src/app/dashboard/page.tsx`): reads all escrow addresses via `factory.getDeployedEscrows()`, batch-reads state for each via `useReadContracts` (buyer, seller, settlementAmount, isFunded, isReleased, approvalCount), displays per-case cards with StatusBadge. Added "View All Cases →" link to main page header. Full end-to-end settlement flow confirmed working on Hardhat local. |
| 2026-03-12 | Polish complete in `page.tsx`: wrong-network guard banner (switchChain to Hardhat/Sepolia), fixed bottom-right toast stack (success = green, error = red, 3.5 s auto-dismiss), `formatEther` for ETH display, `useChainId`/`useSwitchChain` network guard hooks. All three polish checklist items ticked. |
| 2026-03-12 | PRD alignment sprint started (Week 4). Gap analysis complete. Pipeline: Phase 1 (network + terminology) → Phase 2 (onboarding + role routing) → Phase 3 (Ricardian generator) → Phase 4–6 (Client / Freelancer / Arbiter pages). localStorage used for cross-role state coordination (no backend). |
| 2026-03-12 | Week 4 PRD alignment complete. All phases done: terminology rename (ETH→PAS, Buyer→Client, Seller→Freelancer, Lawyer→Arbiter), onboarding role-selector page, RoleGuard, RicardianGenerator (Philippine FSA template + SHA256), Client/Freelancer/Arbiter role pages, pending deals queue in Arbiter. Polkadot EVM Testnet added to Web3Provider (chain ID 420420417, RPC https://eth-rpc-testnet.polkadot.io/, PAS currency). |
