# Agartha — Context & Progress Status

> This file is updated every time a code change is made. Use it as the source of truth for current project state.

---

## Current Status: Day 21 of 21

**Phase:** Production-ready on Polkadot EVM Testnet — Supabase backend, error handling, and all UX issues resolved

All features complete and deployed to Polkadot Paseo Testnet. Recent changes: Supabase DB replaces all localStorage (users, deals, cpra_ledger_progress tables); 7 API routes; server-side error logging to `error_logs` table; generic client-facing error messages; raw client-side transaction errors replaced with "Transaction failed. Please try again."; deadline past-date validation (`min` attribute); CPRA progress auto-loaded from DB on case load (reload-safe); deployed deal removed from arbiter pending queue after escrow creation; Switch Role button removed (roles are permanent); `deploy.js` merges `.env.local` instead of overwriting.

---

## 3-Week Progress Tracker

### Week 1 — Smart Contract Architecture `[COMPLETE]`

| Day | Task | Status |
|-----|------|--------|
| 1–2 | Multi-sig escrow + Ricardian hash storage | Done |
| 3–4 | CPRA compliance ledger contract | Done |
| 5   | Factory pattern contract | Done |
| 6–7 | Remix testing + Sepolia deployment + ABI export | Done |

**Deployed Contracts (Polkadot Paseo EVM Testnet — current):**
- `LegalFactory`: `0x36d30Acc4f6A87b8A28236368F2Ab1a3f495cAA7`
- `CPRALedger`: `0xe8966f76DF07da1C8FE6eef88314e9aA33a2bd7B`
- `LegalEscrow` — deployed per case via factory (no fixed address)

**Previously deployed on Sepolia Testnet (stale — not in active use):**
- `LegalFactory`: `0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7`
- `CPRALedger`: `0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1`

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

### Week 4 — PRD Alignment `[COMPLETE]`

| Phase | Task | Status |
|-------|------|--------|
| 1 | Network config: add Paseo Testnet to Web3Provider + ETH→PAS labels | Done |
| 1 | Terminology rename: Buyer→Client, Seller→Freelancer, Lawyer→Arbiter | Done |
| 2 | Onboarding page (`/`) — connect wallet + role selector (Client / Freelancer / Arbiter) | Done |
| 2 | Role routing: `/client`, `/freelancer`, `/arbiter` pages + `RoleGuard` component | Done |
| 3 | `RicardianGenerator.tsx` — Philippine FSA template form → auto-hash (replaces PDF uploader) | Done |
| 4 | Client page (`/client`) — create deal → submit for Arbiter review → fund → approve | Done |
| 5 | Freelancer page (`/freelancer`) — view contracts → approve release → settlement received | Done |
| 6 | Arbiter page (`/arbiter`) — pending deals queue + review + deploy + CPRA ledger | Done |
| Bug fixes | Remove Fund Escrow from Arbiter; on-chain history for all roles; CPRA ledger persistence; dashboard privacy | Done |

---

## File Map

```
legal-escrow-dapp/
├── src/
│   ├── app/
│   │   ├── layout.tsx                Root layout — Web3Provider wrapper
│   │   ├── page.tsx                  Onboarding — wallet connect + role selector (DB registration)
│   │   ├── api/
│   │   │   ├── users/
│   │   │   │   ├── register/route.ts POST — register wallet+role; 409 on conflict
│   │   │   │   └── [wallet_address]/
│   │   │   │       └── route.ts      GET — fetch registered role for wallet
│   │   │   ├── deals/
│   │   │   │   ├── route.ts          POST create deal / GET list by wallet
│   │   │   │   ├── claim/route.ts    POST — arbiter claims deal via deal code
│   │   │   │   ├── by-hash/
│   │   │   │   │   └── [document_hash]/route.ts  GET form_data by on-chain hash
│   │   │   │   └── [id]/
│   │   │   │       └── deploy/route.ts  PATCH — set escrow_address after factory deploy
│   │   │   └── ledger/
│   │   │       └── [escrow_address]/route.ts  GET+PUT CPRA step flags
│   │   ├── arbiter/
│   │   │   └── page.tsx              Arbiter workflow — pending review queue (DB), deploy, CPRA ledger (DB)
│   │   ├── client/
│   │   │   └── page.tsx              Client workflow — create deal (DB), fund escrow, approve
│   │   ├── freelancer/
│   │   │   └── page.tsx              Freelancer workflow — view contracts, approve release (agreement via DB)
│   │   ├── dashboard/
│   │   │   └── page.tsx              Shared read-only all-cases view (all roles)
│   │   └── globals.css
│   ├── components/
│   │   ├── Web3Provider.tsx          Wagmi + RainbowKit + TanStack Query config (Polkadot EVM Testnet only)
│   │   ├── RoleGuard.tsx             DB role guard — redirects unauthenticated users to onboarding
│   │   └── RicardianGenerator.tsx    Philippine FSA template form → rendered doc → SHA256 hash
│   ├── lib/
│   │   ├── errors.ts                 Server-side logError() — writes to Supabase error_logs table
│   │   └── supabase/
│   │       └── server.ts             Supabase admin client (service role) — API routes only
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
| Document Hashing | crypto-js (browser-side SHA256) |
| Network | Polkadot EVM Testnet (chain ID 420420417) — frontend; Hardhat localhost for contract dev/deploy only |

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
- [x] Remove Fund Escrow button from Arbiter page (Client-only action)
- [x] Add on-chain "My Cases" history to Arbiter page (persistent across reloads, Load button per case)
- [x] Add on-chain "My Deals" history to Client page (persistent across reloads, per-deal Fund/Approve)
- [x] Add `lawyer` field to Freelancer batch reads; show Arbiter address in contract cards
- [x] Persist CPRA ledger progress per escrow in localStorage (`agartha_ledger_<addr>`)
- [x] Dashboard privacy: truncate wallet addresses, hide settlement amounts ("Confidential")

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
| 2026-03-12 | Bug fixes across all role pages: removed Fund Escrow from Arbiter (Client-only); rewrote Arbiter/Client pages to load on-chain history via `getDeployedEscrows()` + `useReadContracts` batch reads filtered by `lawyer`/`buyer` — persistent across page refreshes; added CPRA ledger progress persistence per escrow (`agartha_ledger_<addr>` localStorage); added `lawyer` field to Freelancer batch reads (8 reads/escrow); dashboard privacy: `truncAddr()` helper, settlement amounts hidden as "Confidential". TypeScript check passes with 0 errors. |
| 2026-03-12 | Issue fix sprint (4 issues): (1) Deal code gating — Client generates `btoa(JSON.stringify(deal))` instead of writing to shared localStorage; Arbiter pastes code to decode + adds to private `agartha_my_pending_deals`; saves `agartha_deal_doc_<hash>` for agreement viewing. (2) Agreement viewing — exported `buildDocument` + `RicardianFormData` from RicardianGenerator; all three role pages batch-read `documentHash` on-chain (+1 read/escrow); View Agreement button when doc in localStorage; Import Agreement via agreement code (base64) for Freelancer; Arbiter "Copy Agreement Code" button per case card. (3) CPRALedger.sol rewritten — added `ILegalEscrow` interface, `caseRegistrar` mapping, `onlyCaseRegistrar` modifier; `registerCase` validates `keccak256(escrowAddr) == caseId` + `ILegalEscrow(escrow).lawyer() == msg.sender`; removed deployer-only restriction; `abis.ts` updated with `caseRegistrar` view function; Arbiter page admin guard + banner removed. (4) Dashboard — strips to `keccak256(escrowAddr)` (truncated) + status badge only; landing page adds "View Global Case Ledger →" link; dashboard links removed from client/arbiter pages. TypeScript check: 0 errors. |
| 2026-03-12 | Supabase database integration. Replaced all localStorage deal/role/CPRA state with durable Supabase PostgreSQL backend. New DB tables: `users` (one wallet = one role, enforced at DB + API level), `deals` (client creates → arbiter claims via deal code → arbiter deploys → escrow_address set), `cpra_ledger_progress` (monotonic boolean steps, survives browser clears). New: `src/lib/supabase/server.ts` (service-role admin client, server-only); 7 API routes under `src/app/api/` (users/register, users/[wallet], deals, deals/claim, deals/by-hash/[hash], deals/[id]/deploy, ledger/[addr]). Updated: all 3 role pages + RoleGuard + onboarding page + requirements.md + README.md. Role conflict prevention at claim time (403 if arbiter = client or freelancer). Freelancer "Import Agreement Code" UI removed — agreement auto-fetched silently by documentHash. localStorage keys removed: `agartha_my_pending_deals`, `agartha_deal_doc_*`, `agartha_ledger_*`, `agartha_escrow_map`. `agartha_role` kept as performance cache. |
| 2026-03-13 | Error handling sprint: `src/lib/errors.ts` (server-side logError → Supabase `error_logs` table); all 7 API routes updated to use logError + generic "Something went wrong" response; `src/app/error.tsx` global Next.js error boundary added. Client-side raw viem transaction errors removed from all 3 portal pages — replaced with generic "Transaction failed" UI. Deadline date input `min` attribute added to `RicardianGenerator.tsx` and `client/page.tsx` to block past date selection. |
| 2026-03-13 | UX fixes: Switch Role button removed from client/arbiter/freelancer pages (roles are permanent). `deploy.js` fixed to merge `.env.local` (read existing → update only contract address keys → write back) instead of overwriting, preserving Supabase credentials. Web3Provider updated to target Polkadot EVM Testnet only (removed Hardhat + Sepolia chains since app is on Paseo). |
| 2026-03-13 | Bug fixes: (1) Arbiter CPRA reload bug — extracted ledger progress fetch from `loadCase()` into a `useEffect` watching `deployedEscrowAddress`; progress now auto-loads from DB whenever a case address is set, preventing "stuck" record buttons after reload. (2) Arbiter pending queue — deployed deal now removed from queue immediately after `factory.createCase()` receipt; `fetchPendingDeals()` called after DB persist in the `factoryReceipt` useEffect. |
| 2026-03-13 | Fix CPRA progress persistence root cause: `/api/ledger/[escrow_address]/route.ts` PUT handler changed from UPDATE (returned 404 if no row existed, silently swallowed by frontend `.catch(() => {})`) to UPSERT (`onConflict: 'escrow_address'`). Row is now created on first PUT if absent; monotonic OR logic preserved. Previously, progress was never written to DB when the arbiter deployed without a pending deal in the queue (no `cpra_ledger_progress` row pre-created), causing all Record buttons to reappear after every reload. |
