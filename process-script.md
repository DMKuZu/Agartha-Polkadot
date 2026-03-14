# AgarthaTech — Process Script

This document describes the system's approach, workflow, input processing, and outputs for the AgarthaTech Legal Escrow dApp. It is intended as context for AI-assisted development and review.

---

## 1. System Approach

AgarthaTech is a **trustless, decentralized legal escrow service** for the freelance economy. Its core goal is to bridge legally binding Philippine digital agreements with blockchain-enforced payments.

### Guiding Principles

- **Trustless execution:** Funds are held by a smart contract, not any individual party. Payment is released only when a 2-of-3 multi-signature approval threshold is met on-chain.
- **Legal grounding:** Every deal is anchored to a Philippine Freelance Service Agreement. The document is either generated in-app (Ricardian Contract Generator) or uploaded by the Client. Its SHA256 hash is stored both in the database and on-chain, creating a tamper-proof link between the legal document and the escrow vault.
- **Role-based access:** Three distinct roles exist — Client, Freelancer, and Arbiter — each with a dedicated portal and a strictly enforced scope of actions.
- **CPRA compliance:** The Arbiter is required to record every case in an on-chain audit ledger (`CPRALedger`) in accordance with the Philippine Code of Professional Responsibility and Accountability (CPRA), Canon III, Section 49–50.
- **Hybrid storage:** Off-chain state (deal metadata, user registration, document files, CPRA progress) lives in Supabase (PostgreSQL + Storage). On-chain state (funds, approvals, cancellations, compliance records) lives in Solidity contracts deployed on the Polkadot EVM-compatible Paseo Testnet (Chain ID 420420417).

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Web3 Integration | wagmi 2, viem 2, RainbowKit |
| Smart Contracts | Solidity 0.8.28, Hardhat 2 |
| Blockchain | Polkadot Paseo Testnet (EVM-compatible, Chain ID 420420417), PAS token |
| Database | Supabase (PostgreSQL + Storage) |
| Authentication | Web3 wallet-only (MetaMask, Talisman, WalletConnect) |

---

## 2. System Roles

| Role | Responsibility |
|------|---------------|
| **Client** (buyer) | Creates the deal, uploads the agreement document, funds the escrow vault, approves work release |
| **Freelancer** (seller) | Reviews and accepts the deal, delivers work, approves payment release |
| **Arbiter** (lawyer) | Philippine-credentialed legal professional; reviews deal, deploys smart contract, acts as tiebreaker in disputes, records compliance steps in the CPRA ledger |

All three roles are registered per wallet address in the Supabase `users` table. A wallet can only hold one role. Role assignment happens once at onboarding and cannot be changed through the UI.

---

## 3. Current Workflow

The system follows a linear, gated workflow with a branching resolution path. Each stage gates on the completion of the previous.

### Stage 0 — Onboarding

1. Any user visits `http://localhost:3000` (or the deployed URL).
2. User connects their Web3 wallet via RainbowKit (MetaMask, Talisman, or WalletConnect).
3. The app checks the Supabase `users` table for the connected wallet address.
   - If registered: redirects immediately to the role-specific portal (`/client`, `/freelancer`, or `/arbiter`).
   - If unregistered: the user selects a role (Client / Freelancer / Arbiter) and `POST /api/users/register` is called.
4. Role is persisted in Supabase and cached in `localStorage` as `agartha_role`.

### Stage 1 — Deal Creation (Client)

1. Client navigates to `/client` (guarded by `RoleGuard`).
2. Client fills in the deal form:
   - Freelancer wallet address (validated on-blur against Supabase to confirm `role = 'freelancer'`)
   - Arbiter wallet address (validated on-blur against Supabase to confirm `role = 'arbiter'`)
   - Settlement amount in PAS
   - Agreement document upload (any file type, max 10 MB)
3. On upload, the file is sent to `POST /api/deals/upload`:
   - File bytes are read server-side.
   - SHA256 hash is computed (`'0x' + sha256(fileBytes)`).
   - File is stored in Supabase Storage bucket `deal-documents` at path `{wallet_lower}/{timestamp}-{filename}`.
   - Response: `{ storage_path, document_hash, filename }`.
4. Client clicks **Submit Deal for Review**. `POST /api/deals` is called with:
   - `client_address`, `freelancer_address`, `arbiter_address`
   - `document_hash` (from upload step)
   - `form_data: { type: 'file', filename, storage_path, amount }`
5. Server validates that all three addresses are registered with the correct roles and are distinct.
6. A new row is inserted into the Supabase `deals` table:
   - `status: 'pending_acceptance'`
   - `arbiter_accepted: false`, `freelancer_accepted: false`
   - `deal_code_id`: base-36 timestamp (short alphanumeric ID)

### Stage 2 — Acceptance (Freelancer and Arbiter)

1. Both the Freelancer (`/freelancer`) and Arbiter (`/arbiter`) portals show a "Pending Acceptance" queue: deals where `status = 'pending_acceptance'` and the wallet address matches the relevant party.
2. Each party can view/download the agreement document via a 1-hour signed Supabase URL (`GET /api/deals/[id]/document?wallet_address=`).
3. Each party clicks **Accept** or **Reject**:
   - **Accept**: `POST /api/deals/[id]/accept` sets `arbiter_accepted = true` or `freelancer_accepted = true`.
     - If both parties have now accepted, `status` is updated to `'accepted'`.
   - **Reject**: `POST /api/deals/[id]/reject` sets `status = 'cancelled'`.
4. Once both accept, the deal moves to the Arbiter's "Ready to Deploy" queue.

### Stage 3 — Smart Contract Deployment (Arbiter)

1. The Arbiter sees the deal in their "Ready to Deploy" queue.
2. Arbiter clicks **Deploy Smart Contract**. The frontend calls `LegalFactory.createCase()` on-chain with:
   - `_buyer` = client wallet address
   - `_seller` = freelancer wallet address
   - `_lawyer` = arbiter wallet address
   - `_settlementAmount` = agreed amount in wei
   - `_documentHash` = SHA256 hash of the uploaded agreement
3. The `LegalFactory` contract deploys a new `LegalEscrow` instance and emits `EscrowCreated(escrowAddress, buyer, seller)`.
4. The frontend parses the emitted event to extract the deployed escrow address.
5. `PATCH /api/deals/[id]/deploy` is called with `escrow_address` and `arbiter_address`:
   - `deals.escrow_address` is set; `deals.status` is updated to `'deployed'`.
   - A new row is created (upserted) in `cpra_ledger_progress` for this escrow.

### Stage 4 — Funding (Client)

1. The Client sees the deployed deal in their "My Deployed Deals" list, now showing the escrow address.
2. Client clicks **Deposit PAS**. The frontend calls `LegalEscrow.fund()` with `msg.value = settlementAmount`.
3. The escrow contract verifies:
   - Sender is the buyer.
   - Contract is not already funded.
   - Exact settlement amount is sent.
4. `isFunded = true` is set on-chain; `Funded` event is emitted.

### Stage 5 — Approval and Release (All Parties)

All three portals (`/client`, `/freelancer`, `/arbiter`) show the funded deal with an approval counter.

#### Happy Path (Release)

1. Each party clicks **Approve Release**. The frontend calls `LegalEscrow.approveRelease()`.
2. The contract verifies: contract is funded, not yet released, caller is a party, caller has not already approved.
3. `hasApproved[msg.sender] = true` is set; `approvalCount` is incremented; `Approved` event is emitted.
4. When `approvalCount >= 2`, `releaseFunds()` is called internally:
   - `isReleased = true`
   - Full balance of the escrow is transferred to the `seller` (freelancer).
   - `Released` event is emitted.

#### Dispute Path (Cancellation)

1. Any party clicks **Approve Cancellation** instead. The frontend calls `LegalEscrow.approveCancellation()`.
2. The contract verifies: funded, not released, not already cancelled, caller hasn't already approved cancellation.
3. `hasCancelApproved[msg.sender] = true`; `cancelApprovalCount` is incremented; `CancelApproved` event is emitted.
4. When `cancelApprovalCount >= 2`:
   - `isCancelled = true`
   - Full balance is refunded to the `buyer` (client).
   - `Refunded` event is emitted.
5. Mutual exclusivity is enforced: a wallet that approved release cannot approve cancellation and vice versa.

### Stage 6 — CPRA Compliance Ledger (Arbiter)

After a deal outcome is determined (`isReleased` or `isCancelled` is true on-chain), the Arbiter is required to record the case in the `CPRALedger` contract. The CPRA section is locked in the UI until the outcome is known.

**Supabase tracks progress** in the `cpra_ledger_progress` table; the `PUT /api/ledger/[escrow_address]` endpoint applies a monotonic OR (steps can only move to `true`, never back to `false`).

#### Released Deal Path (3 steps)

| Step | UI Button | On-Chain Call | Supabase Update |
|------|-----------|---------------|-----------------|
| 1 | Register Case | `CPRALedger.registerCase(caseId, clientId, escrowContract, purpose)` | `registered = true` |
| 2 | Record Deposit | `CPRALedger.recordDeposit(caseId, amount)` | `deposit_recorded = true` |
| 3 | Finalize Case | `CPRALedger.finalizeCase(caseId, amount)` — records disbursement + closes in one TX | `disbursement_recorded = true`, `closed = true` |

#### Cancelled Deal Path (2 steps)

| Step | UI Button | On-Chain Call | Supabase Update |
|------|-----------|---------------|-----------------|
| 1 | Register Case | `CPRALedger.registerCase(caseId, clientId, escrowContract, purpose)` | `registered = true` |
| 2 | Close Cancelled Case | `CPRALedger.closeCancelledCase(caseId)` — closes without disbursement | `closed = true` |

The `caseId` is `keccak256(abi.encodePacked(escrowContractAddress))`.

---

## 4. How the System Processes Input

### User Input Sources

| Input | Where Entered | How Processed |
|-------|--------------|---------------|
| Wallet connection | RainbowKit modal | wagmi `useAccount()` hook provides `address`; checked against Supabase on connect |
| Role selection | Landing page (`/`) | `POST /api/users/register` — stored in Supabase `users` table |
| Freelancer + Arbiter addresses | Client portal form | Validated on-blur via `GET /api/users/[wallet_address]`; inline error shown if wrong role |
| Settlement amount (PAS) | Client portal form | Stored as string in `form_data.amount` in Supabase; passed to contract as wei via `parseEther()` |
| Agreement document | Client portal file upload | Sent as `multipart/form-data` to `POST /api/deals/upload`; SHA256 hashed server-side; stored in Supabase Storage |
| Deal creation | Client portal submit | `POST /api/deals` — validated, then inserted into Supabase `deals` |
| Accept / Reject actions | Freelancer / Arbiter portals | `POST /api/deals/[id]/accept` or `/reject` — updates `deals` row in Supabase |
| Deploy smart contract | Arbiter portal | wagmi `useWriteContract()` calls `LegalFactory.createCase()` on-chain; escrow address parsed from `EscrowCreated` event; `PATCH /api/deals/[id]/deploy` persists it |
| Fund escrow | Client portal | wagmi `useWriteContract()` calls `LegalEscrow.fund()` with `msg.value = settlementAmount` |
| Approve release / cancellation | All portals | wagmi `useWriteContract()` calls `LegalEscrow.approveRelease()` or `approveCancellation()` |
| CPRA ledger steps | Arbiter portal | wagmi `useWriteContract()` calls `CPRALedger` functions; `PUT /api/ledger/[escrow]` tracks progress in Supabase |

### Data Flow Architecture

```
User (Browser)
    │
    ├─ [Web3 Wallet] ──────────────────────────────────────────────┐
    │      wagmi + viem + RainbowKit                               │
    │      Reads on-chain state via useReadContracts()             │
    │      Writes via useWriteContract()                           │
    │                                                              ▼
    │                                              Polkadot EVM Testnet
    │                                              ┌──────────────────────────┐
    │                                              │ LegalFactory             │
    │                                              │  createCase()            │
    │                                              │  getDeployedEscrows()    │
    │                                              └────────────┬─────────────┘
    │                                                           │ deploys
    │                                                           ▼
    │                                              ┌──────────────────────────┐
    │                                              │ LegalEscrow (per deal)   │
    │                                              │  fund()                  │
    │                                              │  approveRelease()        │
    │                                              │  approveCancellation()   │
    │                                              └──────────────────────────┘
    │
    │                                              ┌──────────────────────────┐
    │                                              │ CPRALedger               │
    │                                              │  registerCase()          │
    │                                              │  recordDeposit()         │
    │                                              │  finalizeCase()          │
    │                                              │  closeCancelledCase()    │
    │                                              └──────────────────────────┘
    │
    └─ [Next.js API Routes] ───────────────────────────────────────┐
           /api/users/register         (POST)                      │
           /api/users/[wallet]         (GET)                       │
           /api/deals                  (POST, GET)                 ▼
           /api/deals/upload           (POST)              Supabase
           /api/deals/[id]/accept      (POST)          ┌─────────────────┐
           /api/deals/[id]/reject      (POST)          │ users table     │
           /api/deals/[id]/deploy      (PATCH)         │ deals table     │
           /api/deals/[id]/document    (GET)           │ cpra_ledger_    │
           /api/deals/by-hash/[hash]   (GET)           │   progress table│
           /api/deals/by-escrow/[addr] (GET)           │ deal-documents  │
           /api/ledger/[escrow]        (GET, PUT)      │   (Storage)     │
                                                       └─────────────────┘
```

### On-Chain State Machine (per `LegalEscrow`)

```
DEPLOYED (not funded)
    │
    │  fund() — buyer sends exact settlementAmount
    ▼
FUNDED (isFunded = true)
    │
    ├──── approveRelease() × 2 ────────────────────────────────────►  RELEASED
    │     (any 2 of 3 parties)                                        (isReleased = true)
    │                                                                  Funds sent to seller
    │
    └──── approveCancellation() × 2 ──────────────────────────────►  CANCELLED
          (any 2 of 3 parties)                                         (isCancelled = true)
                                                                       Funds refunded to buyer
```

### Off-Chain Status Machine (Supabase `deals.status`)

```
pending_acceptance
    │
    ├──── either party rejects  ──────────────────────────────────►  cancelled
    │
    │     freelancer_accepted = true AND arbiter_accepted = true
    ▼
accepted
    │
    │     Arbiter deploys smart contract
    ▼
deployed
```

---

## 5. Current Output

### What the System Produces

#### For the Client
- A deployed escrow vault (smart contract address on Polkadot EVM Testnet) tied to their specific deal.
- Confirmation of funded state and real-time approval count (e.g., "Funded — 1/3 approvals").
- Payment release or refund executed automatically on-chain when the 2-of-3 threshold is reached.
- Status badges in the UI: `Awaiting Funding` → `Funded — X/3 approvals` → `Released` or `Cancelled`.

#### For the Freelancer
- Visibility into pending deals with the ability to view and download the agreement document.
- Guaranteed on-chain payment (transferred directly to their wallet) once 2 approvals are recorded.
- Real-time approval and cancellation counters across all their deployed deals.

#### For the Arbiter
- A deployment tool that triggers `LegalFactory.createCase()` and records the resulting escrow address.
- A CPRA compliance workflow that records each step in the `CPRALedger` on-chain contract and tracks progress in Supabase.
- CPRA badges on completed deals: `CPRA Pending` (amber) or `CPRA Filed` (indigo).

#### Global Case Ledger (`/dashboard`)
- A public, read-only list of all deployed escrow contracts.
- Each entry shows an anonymised Case ID (`keccak256(escrowAddress)`, truncated) and a status badge.
- Status badges: `Awaiting Funding`, `Funded`, `Released`, `Cancelled`.
- CPRA badges for completed cases: `CPRA Pending` or `CPRA Filed`.
- No party wallet addresses are exposed to the public dashboard.

#### On-Chain Audit Trail
- Every action (fund, approve, release, refund, register case, record deposit, disburse, close) emits an on-chain event stored immutably on the Polkadot EVM Testnet.
- The `CPRALedger` stores `depositedAmount`, `disbursedAmount`, `isClosed`, `clientId`, `escrowContract`, and `purpose` for every registered case.

#### Document Integrity
- The SHA256 hash of the uploaded agreement file is stored in both Supabase (`deals.document_hash`) and the `LegalEscrow` contract (`documentHash`).
- Any party can independently verify the document has not been altered by recomputing the hash of the file they downloaded and comparing it to the on-chain value.

---

## 6. Deployed Contract Addresses (Polkadot EVM Testnet — Chain ID 420420417)

| Contract | Address |
|----------|---------|
| `LegalFactory` (EscrowFactory) | `0x103787ebcdED73f3F4B2390D822bacF3a29Ae134` |
| `CPRALedger` | `0x98F6a19b499dA372F2d780Ab9568A1F81E58501c` |

Block Explorer: `https://blockscout-testnet.polkadot.io`

---

## 7. Key Files Reference

| File | Purpose |
|------|---------|
| `backend/contracts/LegalEscrow.sol` | Per-deal escrow vault; holds funds; 2-of-3 multi-sig release and cancellation |
| `backend/contracts/LegalFactory.sol` | Factory that deploys a new `LegalEscrow` per deal |
| `backend/contracts/CPRALedger.sol` | On-chain compliance audit trail for the Arbiter |
| `backend/scripts/deploy.js` | Deploys `LegalFactory` + `CPRALedger`; writes addresses to frontend `.env.local` |
| `legal-escrow-dapp/src/contracts/abis.ts` | ABI definitions + contract addresses for the frontend |
| `legal-escrow-dapp/src/app/page.tsx` | Landing page / onboarding / role selection |
| `legal-escrow-dapp/src/app/client/page.tsx` | Client portal: deal creation, funding, approvals |
| `legal-escrow-dapp/src/app/freelancer/page.tsx` | Freelancer portal: deal review, acceptance, approvals |
| `legal-escrow-dapp/src/app/arbiter/page.tsx` | Arbiter portal: deal review, contract deployment, CPRA compliance |
| `legal-escrow-dapp/src/app/dashboard/page.tsx` | Public global case ledger |
| `legal-escrow-dapp/src/components/RicardianGenerator.tsx` | UI component + helper to generate a Philippine Freelance Service Agreement text and its SHA256 hash |
| `legal-escrow-dapp/src/components/RoleGuard.tsx` | Route protection: redirects if connected wallet's role doesn't match the page |
| `legal-escrow-dapp/src/app/api/deals/route.ts` | Create deal (POST) + list deals for wallet (GET) |
| `legal-escrow-dapp/src/app/api/deals/upload/route.ts` | Upload agreement file; returns SHA256 hash + storage path |
| `legal-escrow-dapp/src/app/api/deals/[id]/accept/route.ts` | Arbiter or freelancer accepts a deal |
| `legal-escrow-dapp/src/app/api/deals/[id]/deploy/route.ts` | Records escrow address after on-chain deployment |
| `legal-escrow-dapp/src/app/api/ledger/[escrow_address]/route.ts` | Read and update CPRA ledger progress in Supabase |
| `CONTEXT_STATUS.md` | Detailed implementation status, DB schema, API reference, known issues |
| `prd.md` | Original product requirements document |
