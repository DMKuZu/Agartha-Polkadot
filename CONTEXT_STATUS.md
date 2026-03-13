# Agartha — Context & Progress Status

> This file is updated every time a code change is made. Use it as the source of truth for current project state.

---

## Current Status: Day 21 of 21 — Feature Complete

**Phase:** Production-ready on Polkadot EVM Testnet

All features complete and deployed. Latest sprint added on-chain deal cancellation (2-of-3 `approveCancellation` multisig refund to client) across all three portals, a single-transaction CPRA `finalizeCase` (combines disbursement + close), mutual exclusivity between release and cancel approval paths, and a file-based agreement document workflow replacing the form-based Ricardian generator for deal creation.

---

## 3-Week Progress Tracker

### Week 1 — Smart Contract Architecture `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 1–2 | Multi-sig escrow + Ricardian hash storage | Done |
| 3–4 | CPRA compliance ledger contract | Done |
| 5   | Factory pattern contract | Done |
| 6–7 | Remix testing + Sepolia deployment + ABI export | Done |

---

### Week 2 — Frontend Foundation & Web3 Middleware `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 8–9   | Next.js project init, routing, layout | Done |
| 10–12 | Wagmi + viem + RainbowKit integration | Done |
| 13–14 | Ricardian engine — PDF upload + browser-side SHA256 hashing | Done |

---

### Week 3 — System Assembly, Syncing, and Polish `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 15–16 | Connect all UI buttons to contract functions | Done |
| 17    | Lawyer dashboard read view + polish | Done |
| 18–19 | End-to-end settlement simulation | Done — confirmed working |
| 20–21 | UI polish, loading states, error handling, network guards | Done |

---

### Week 4 — PRD Alignment `[COMPLETE]`

| Phase | Task | Status |
|-------|------|--------|
| 1 | Network config: add Paseo Testnet to Web3Provider + ETH→PAS labels | Done |
| 1 | Terminology rename: Buyer→Client, Seller→Freelancer, Lawyer→Arbiter | Done |
| 2 | Onboarding page (`/`) — connect wallet + role selector (Client / Freelancer / Arbiter) | Done |
| 2 | Role routing: `/client`, `/freelancer`, `/arbiter` pages + `RoleGuard` component | Done |
| 3 | `RicardianGenerator.tsx` — Philippine FSA template form → auto-hash | Done |
| 4 | Client page (`/client`) — create deal → submit for Arbiter review → fund → approve | Done |
| 5 | Freelancer page (`/freelancer`) — view contracts → approve release → settlement received | Done |
| 6 | Arbiter page (`/arbiter`) — pending deals queue + review + deploy + CPRA ledger | Done |
| Bug fixes | Remove Fund Escrow from Arbiter; on-chain history for all roles; CPRA ledger persistence; dashboard privacy | Done |

---

### Post-Sprint — Acceptance Workflow + File Documents + Cancellation `[COMPLETE]`

| Feature | Status |
|---------|--------|
| Pre-deployment acceptance: Client enters freelancer + arbiter addresses; both must accept | Done |
| Inline address role validation at deal creation | Done |
| `POST /api/deals/[id]/accept`, `POST /api/deals/[id]/reject` API routes | Done |
| `arbiter_accepted`, `freelancer_accepted` DB columns | Done |
| File upload workflow: `POST /api/deals/upload` → Supabase Storage → SHA256 hash | Done |
| Document retrieval: `GET /api/deals/[id]/document` → signed URL | Done |
| `DELETE /api/deals/[id]` — client can delete cancelled deals | Done |
| `approveCancellation()` on `LegalEscrow.sol` — 2-of-3 multisig refund to client | Done |
| `finalizeCase()` on `CPRALedger.sol` — single-TX disbursement + close | Done |
| ABI updates for all new contract functions and events | Done |
| Cancellation UI across all 3 portals (2/3 counter, mutual exclusivity with release path) | Done |
| CPRA ledger reduced from 4 steps to 3 (Register → Record Deposit → Finalize Case) | Done |
| Finalize Case gated on steps 1 + 2 completed + `isReleased` | Done |

---

## Deployed Contract Addresses

### Polkadot Paseo EVM Testnet — Current (active in `.env.local`)

| Contract | Address |
|----------|---------|
| `LegalFactory` | `0x020C80A17aD5B2aC1a4F3D799A18122FCd5079B6` |
| `CPRALedger` | `0x0D46ca33610BB7529AC9C1a30ABf30D08a82C9d5` |
| `LegalEscrow` | Deployed per case via factory (no fixed address) |

### Hardcoded fallback in `abis.ts` (previous deployment)

| Contract | Address |
|----------|---------|
| `LegalFactory` | `0xaA9c13768e1427762e3AA77CdD0c78429994205E` |
| `CPRALedger` | `0x49aEea0906AC3c17d0A77554cbaf488Dd83769BC` |

### Previous Polkadot Testnet (stale)

| Contract | Address |
|----------|---------|
| `LegalFactory` | `0x36d30Acc4f6A87b8A28236368F2Ab1a3f495cAA7` |
| `CPRALedger` | `0xe8966f76DF07da1C8FE6eef88314e9aA33a2bd7B` |

### Previous Sepolia Testnet (stale — no longer in active use)

| Contract | Address |
|----------|---------|
| `LegalFactory` | `0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7` |
| `CPRALedger` | `0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1` |

ABIs exported to: `legal-escrow-dapp/src/contracts/abis.ts`

---

## File Map

```
legal-escrow-dapp/
├── src/
│   ├── app/
│   │   ├── layout.tsx                Root layout — Web3Provider wrapper
│   │   ├── page.tsx                  Onboarding — wallet connect + role selector (DB registration)
│   │   ├── error.tsx                 Global Next.js error boundary
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── register/route.ts    POST — register wallet+role; 409 on conflict
│   │   │   │   └── [wallet_address]/
│   │   │   │       └── route.ts         GET — fetch registered role for wallet
│   │   │   ├── deals/
│   │   │   │   ├── route.ts             POST create deal / GET list by wallet
│   │   │   │   ├── upload/
│   │   │   │   │   └── route.ts         POST — multipart file upload → Supabase Storage → SHA256 hash
│   │   │   │   ├── by-hash/
│   │   │   │   │   └── [document_hash]/route.ts  GET form_data by on-chain hash
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts          GET single deal / DELETE cancelled deal
│   │   │   │       ├── accept/route.ts   POST — arbiter or freelancer accepts deal
│   │   │   │       ├── reject/route.ts   POST — arbiter or freelancer rejects deal
│   │   │   │       ├── deploy/route.ts   PATCH — set escrow_address after factory deploy
│   │   │   │       └── document/route.ts GET — signed Supabase Storage URL for document download
│   │   │   └── ledger/
│   │   │       └── [escrow_address]/route.ts  GET+PUT CPRA step flags (upsert on PUT)
│   │   ├── arbiter/
│   │   │   └── page.tsx              Arbiter workflow — pending review queue (DB), deploy, CPRA ledger
│   │   ├── client/
│   │   │   └── page.tsx              Client workflow — create deal (file upload), fund escrow, approve/cancel
│   │   ├── freelancer/
│   │   │   └── page.tsx              Freelancer workflow — view contracts, approve/cancel
│   │   ├── dashboard/
│   │   │   └── page.tsx              Shared read-only all-cases view (caseId + status, no party data)
│   │   └── globals.css
│   ├── components/
│   │   ├── Web3Provider.tsx          Wagmi + RainbowKit config (Polkadot EVM Testnet only)
│   │   ├── RoleGuard.tsx             DB role guard — redirects unauthenticated users to onboarding
│   │   └── RicardianGenerator.tsx    Philippine FSA template form → rendered doc → SHA256 hash
│   ├── lib/
│   │   ├── errors.ts                 Server-side logError() — writes to Supabase error_logs table
│   │   └── supabase/
│   │       └── server.ts             Supabase admin client (service role) — API routes only
│   └── contracts/
│       └── abis.ts                   All ABIs + deployed addresses (env var fallback)

backend/
├── contracts/
│   ├── LegalEscrow.sol               2-of-3 multi-sig escrow + Ricardian hash + cancellation
│   ├── LegalFactory.sol              Factory — deploys one LegalEscrow per case
│   ├── CPRALedger.sol                On-chain audit trail — registerCase, recordDeposit, finalizeCase
│   └── Lock.sol                      Hardhat boilerplate (unused)
├── scripts/
│   └── deploy.js                     Deploys Factory + Ledger; auto-writes .env.local to frontend (merge, not overwrite)
├── hardhat.config.js                 Solidity 0.8.28 + hardhat/localhost (31337) + polkadotTestnet (420420417)
└── test/
```

---

## localStorage Keys

| Key | Written by | Read by | Content |
|-----|-----------|---------|---------|
| `agartha_role` | Onboarding page, RoleGuard | RoleGuard, all pages | `'client' \| 'freelancer' \| 'arbiter'` — **cache only**; DB is authoritative |

**Removed keys (now in Supabase DB):**

| Key removed | Replaced by |
|-------------|-------------|
| `agartha_my_pending_deals` | `deals` table rows where `LOWER(arbiter_address) = wallet` |
| `agartha_deal_doc_<documentHash>` | `deals.form_data` via `GET /api/deals/by-hash/[hash]` |
| `agartha_ledger_<escrowAddr>` | `cpra_ledger_progress` via `GET/PUT /api/ledger/[addr]` |
| `agartha_escrow_map` | `deals.escrow_address` via `PATCH /api/deals/[id]/deploy` |

---

## Supabase Database Tables

| Table | Purpose |
|-------|---------|
| `users` | One row per wallet — stores `wallet_address` (lowercase), `role` |
| `deals` | Deal lifecycle — `client_address`, `freelancer_address`, `arbiter_address`, `document_hash`, `form_data` (JSONB), `status`, `arbiter_accepted`, `freelancer_accepted`, `escrow_address`, `deal_code_id` |
| `cpra_ledger_progress` | Per-escrow CPRA step booleans — `registered`, `deposit_recorded`, `disbursement_recorded`, `closed` (monotonic, upsert) |
| `error_logs` | Server-side error captures from `logError()` |

**Deal status values:** `pending_acceptance` → `accepted` → `deployed` (or `cancelled` if rejected)

**`form_data` shape (file-based deal):**
```json
{
  "type": "file",
  "filename": "agreement.pdf",
  "storage_path": "deals/<uuid>/agreement.pdf",
  "amount": "2.5"
}
```

---

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_FACTORY_ADDRESS` | `legal-escrow-dapp/.env.local` | LegalFactory on-chain address |
| `NEXT_PUBLIC_LEDGER_ADDRESS` | `legal-escrow-dapp/.env.local` | CPRALedger on-chain address |
| `NEXT_PUBLIC_SUPABASE_URL` | `legal-escrow-dapp/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `legal-escrow-dapp/.env.local` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `legal-escrow-dapp/.env.local` | Supabase service role key (server-only) |
| `DEPLOYER_PRIVATE_KEY` | `backend/.env` | Private key for contract deployment |

---

## Polkadot Testnet Deployment

```bash
# Create backend/.env with deployer key
echo "DEPLOYER_PRIVATE_KEY=0x<key>" > backend/.env

# Deploy to Polkadot Paseo Testnet (auto-writes .env.local to frontend)
cd backend
npx hardhat run scripts/deploy.js --network polkadotTestnet

# Start frontend
cd legal-escrow-dapp
npm run dev
```

MetaMask must be connected to **Polkadot EVM Testnet** (chain 420420417).

---

## Local Contract Development (Hardhat only — frontend requires Web3Provider change)

> The frontend Web3Provider is configured for Polkadot EVM Testnet only. To use it with a local Hardhat node, add `hardhat` back to the `chains` array in `Web3Provider.tsx`.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Smart Contracts | Solidity 0.8.28, Hardhat |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Web3 Hooks | Wagmi 2, viem 2 |
| Wallet UI | RainbowKit 2 |
| Data Fetching | TanStack React Query 5 |
| Database | Supabase (PostgreSQL) — users, deals, CPRA ledger |
| File Storage | Supabase Storage — agreement documents (signed URL access) |
| Document Hashing | crypto-js (browser-side SHA256) |
| Network | Polkadot EVM Testnet (chain ID 420420417) — frontend; Hardhat localhost for contract dev only |

---

## Smart Contract Summary

### LegalEscrow.sol
- State: `buyer`, `seller`, `lawyer`, `settlementAmount`, `documentHash`, `isFunded`, `isReleased`, `approvalCount`, `hasApproved(address)`, `isCancelled`, `cancelApprovalCount`, `hasCancelApproved(address)`
- `fund()` — buyer (Client) deposits exact settlement amount (payable)
- `approveRelease()` — any party approves; auto-releases funds to seller at 2/3
- `approveCancellation()` — any party approves; auto-refunds funds to buyer at 2/3
- `onlyParties` modifier restricts all calls
- Events: `Funded`, `Approved`, `Released`, `CancelApproved`, `Refunded`

### LegalFactory.sol
- `createCase(buyer, seller, lawyer, amount, documentHash)` → deploys `LegalEscrow`, returns address
- `getDeployedEscrows()` → `address[]`
- Event: `EscrowCreated(escrowAddress, buyer, seller)`

### CPRALedger.sol
- Owner: `lawFirmAdmin` (deployer)
- `registerCase(caseId, clientId, escrowContract, purpose)` — only callable by lawyer of that escrow
- `recordDeposit(caseId, amount)` — records incoming funds
- `recordDisbursement(caseId, amount)` — records outgoing funds (separate from closeCase)
- `closeCase(caseId)` — marks case closed (immutable after)
- `finalizeCase(caseId, amount)` — records disbursement AND closes in one transaction (preferred)
- `caseRegistrar(caseId)` — returns the address that registered each case
- `mapping(bytes32 => CaseRecord)` — tracks clientId, escrowContract, depositedAmount, disbursedAmount, isClosed, purpose

---

## Key Wagmi Hooks in Use

```typescript
useAccount()                      // connected wallet address + isConnected
useWriteContract()                // send txns: createCase, fund, approveRelease, approveCancellation, ledger steps
useWaitForTransactionReceipt()    // parse EscrowCreated log to get new escrow address
useReadContract()                 // read escrow/ledger/factory state (single)
useReadContracts()                // batch read multiple escrow fields (11 reads/escrow for client, 12 for freelancer)
useChainId()                      // current chain
useSwitchChain()                  // network guard (must be on 31337, 11155111, or 420420417)
```

---

## Multicall Stride Reference

| Portal | Reads per escrow | Fields |
|--------|-----------------|--------|
| Arbiter (My Cases) | 8 | lawyer, buyer, seller, settlementAmount, isFunded, isReleased, approvalCount, documentHash |
| Client (My Deals) | 11 | buyer, seller, settlementAmount, isFunded, isReleased, approvalCount, hasApproved, documentHash, isCancelled, cancelApprovalCount, hasCancelApproved |
| Freelancer (My Contracts) | 12 | seller, buyer, lawyer, settlementAmount, isFunded, isReleased, approvalCount, hasApproved, documentHash, isCancelled, cancelApprovalCount, hasCancelApproved |

---

## CPRA Ledger Steps

The arbiter completes 3 steps (reduced from 4 with `finalizeCase`):

| Step | Function | Available when |
|------|----------|---------------|
| 1. Register Case | `registerCase()` | Always (after deploy) |
| 2. Record Deposit | `recordDeposit()` | `isFunded === true` |
| 3. Finalize Case | `finalizeCase()` | `isReleased === true` AND steps 1 + 2 complete |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-10 | Initial CONTEXT_STATUS.md created. Days 15–16 in progress. |
| 2026-03-10 | Local testing setup: added `backend/scripts/deploy.js`, `hardhat.config.js` localhost network, `hardhat` chain to `Web3Provider.tsx`, env var address resolution in `abis.ts`. |
| 2026-03-11 | Created `requirements.md` with all library versions. Updated `README.md` with local + Sepolia testing instructions and end-to-end settlement flow. |
| 2026-03-11 | Fixed `page.tsx`: address args now cast as `0x${string}`, added `isAddress` validation, inline address format errors, transaction error surface via `isError`/`error.message`, lawyer address displayed in UI. Added MetaMask nonce reset instructions to local testing section. |
| 2026-03-11 | Completed Days 15–16 core wiring in `page.tsx`: `parseEventLogs` extracts escrow address from `EscrowCreated` receipt, `fund()` deposit section (Step 3), `approveRelease()` with live dot-progress indicator and per-wallet approval guard (Step 4), settlement complete screen (Step 5). Separate `useWriteContract` and `useWaitForTransactionReceipt` hooks for factory vs escrow. All escrow state refetches on tx confirmation. |
| 2026-03-11 | Wired CPRA Ledger (Step 6) in `page.tsx`: 3rd `useWriteContract`/`useWaitForTransactionReceipt` for ledger txns; `lawFirmAdmin` read + `isAdmin` guard; deterministic `caseId = keccak256(escrowAddress)`; `casePurpose` form field; `ledgerDone` step-tracking state advanced by `useEffect` after each confirmed ledger tx; `LedgerStepRow` inline component; 4-step sequential UI (Register → Deposit → Disbursement → Close) with amber admin warning banner. |
| 2026-03-11 | Fixed `Web3Provider.tsx`: added explicit `transports` to `getDefaultConfig` — `hardhat` chain now uses `http('http://127.0.0.1:8545')`, `sepolia` uses `http()`. Without this, wagmi polled WalletConnect's cloud RPC for receipts instead of localhost. |
| 2026-03-11 | Built lawyer dashboard at `/dashboard`: reads all escrow addresses via `factory.getDeployedEscrows()`, batch-reads state for each via `useReadContracts`, displays per-case cards with StatusBadge. Full end-to-end settlement flow confirmed working on Hardhat local. |
| 2026-03-12 | Polish complete: wrong-network guard banner (switchChain), toast stack (success = green, error = red, 3.5 s auto-dismiss), `formatEther` for ETH display, `useChainId`/`useSwitchChain` network guard hooks. |
| 2026-03-12 | PRD alignment sprint: terminology rename (ETH→PAS, Buyer→Client, Seller→Freelancer, Lawyer→Arbiter), onboarding role-selector page, RoleGuard, RicardianGenerator (Philippine FSA template + SHA256), Client/Freelancer/Arbiter role pages, pending deals queue in Arbiter. Polkadot EVM Testnet added to Web3Provider. |
| 2026-03-12 | Bug fixes: removed Fund Escrow from Arbiter; on-chain history via `getDeployedEscrows()` + `useReadContracts` batch reads filtered by role; CPRA ledger progress persistence; dashboard privacy (truncated addresses, no amounts). |
| 2026-03-12 | Deal code system: `btoa(JSON.stringify(deal))` codes; Arbiter pastes code to decode; `buildDocument`+`RicardianFormData` exported; `documentHash` batch-read on-chain; CPRALedger rewritten with `caseRegistrar` mapping + `onlyCaseRegistrar` modifier. |
| 2026-03-12 | Supabase database integration. Replaced all localStorage deal/role/CPRA state with Supabase PostgreSQL. New DB tables: `users`, `deals`, `cpra_ledger_progress`. 7 API routes added. Role conflict prevention at claim time. |
| 2026-03-13 | Error handling sprint: `src/lib/errors.ts` (server-side logError → `error_logs` table); all API routes updated; global `error.tsx` boundary. Raw viem errors removed from portal pages. Deadline date `min` attribute added. |
| 2026-03-13 | UX fixes: Switch Role button removed (roles are permanent). `deploy.js` fixed to merge `.env.local` instead of overwriting. Web3Provider targets Polkadot EVM Testnet only. |
| 2026-03-13 | Bug fixes: CPRA reload bug fixed with `useEffect` watching `deployedEscrowAddress`. Arbiter pending queue auto-clears after deploy receipt. |
| 2026-03-13 | CPRA UPSERT fix: `/api/ledger/[addr]` PUT changed from UPDATE to UPSERT (`onConflict: 'escrow_address'`) — row now created on first write if absent. |
| 2026-03-13 | Pre-deployment acceptance workflow: Deal code sharing replaced with direct address-based routing. Client inputs both freelancer AND arbiter wallet addresses with inline role validation. Both must accept before arbiter can deploy. `POST /api/deals/[id]/accept`, `POST /api/deals/[id]/reject` added. `arbiter_accepted`, `freelancer_accepted` DB columns added. |
| 2026-03-13 | File upload workflow: `RicardianGenerator.tsx` form replaced with file upload for deal creation. `POST /api/deals/upload` uploads to Supabase Storage and returns SHA256 hash. `GET /api/deals/[id]/document` returns signed URL. `DELETE /api/deals/[id]` added for client to delete cancelled deals. `ViewDocumentButton` component added to all three portals. |
| 2026-03-13 | Contract upgrade — `approveCancellation()` added to `LegalEscrow.sol`: 2-of-3 multisig; on 2nd approval sets `isCancelled = true` and refunds balance to buyer. New state: `isCancelled`, `cancelApprovalCount`, `hasCancelApproved(address)`. Events: `CancelApproved`, `Refunded`. |
| 2026-03-13 | Contract upgrade — `finalizeCase(caseId, amount)` added to `CPRALedger.sol`: records disbursement and closes case in a single transaction (replaces separate `recordDisbursement` + `closeCase` calls). |
| 2026-03-13 | Contracts redeployed to Polkadot Paseo EVM Testnet. New addresses written to `.env.local`: Factory `0x020C80A17aD5B2aC1a4F3D799A18122FCd5079B6`, CPRALedger `0x0D46ca33610BB7529AC9C1a30ABf30D08a82C9d5`. ABI updated in `abis.ts` with all new entries. |
| 2026-03-13 | Frontend — cancellation UI across all 3 portals: 3-dot / `/3` cancel approval counter; mutual exclusivity (wallet that approved release cannot approve cancellation and vice versa); "Deal Cancelled" banners; `isCancelled` condition hides release section when cancelled. Multicall strides updated: client → 11 reads/escrow, freelancer → 12 reads/escrow. |
| 2026-03-13 | Frontend — CPRA ledger reduced from 4 steps to 3: "Record Disbursement" + "Close Case" rows replaced by single "Finalize Case (Disburse + Close)" row calling `finalizeCase()`. Finalize Case gated on `isReleased AND ledgerDone.registered AND ledgerDone.depositRecorded`. `LedgerStep` type updated (`'finalize'` marks both `disbursementRecorded` and `closed`). TypeScript check: 0 errors. |
