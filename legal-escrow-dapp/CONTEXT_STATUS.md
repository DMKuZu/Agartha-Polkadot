# CONTEXT_STATUS

Current implementation state of the Legal Escrow DApp.

---

## Completed Features

### User Registration
- Wallets register with a role: `client`, `freelancer`, or `arbiter`
- Role stored in Supabase `users` table
- `RoleGuard` component redirects to registration if role doesn't match the page

### Deal Creation (Client)
- Client selects freelancer + arbiter by wallet address
- Inline address validation: checks role in DB on blur
- Uploads agreement document (any file type, max 10 MB) to Supabase Storage bucket `deal-documents`
- SHA256 hash computed server-side, stored in `deals.document_hash` and recorded on-chain
- `form_data` JSONB: `{ type: 'file', filename, storage_path, amount }`
- Deal created with `status: 'pending_acceptance'`, `arbiter_accepted: false`, `freelancer_accepted: false`

### Acceptance Workflow
- **Freelancer portal**: "Pending Acceptance" queue shows deals where `status = 'pending_acceptance'`
  - Can review filename + view/download document via 1-hour signed URL
  - Accept → `freelancer_accepted = true`; Reject → `status = 'cancelled'`
- **Arbiter portal**: same queue with same actions
  - When both accept → `status = 'accepted'` + moved to "Ready to Deploy"

### Deploy & Fund
- Arbiter deploys escrow smart contract (pre-filled from deal)
- `PATCH /api/deals/[id]/deploy` updates DB with `escrow_address` + `status: 'deployed'`
- Client sees deployed deal in "My Deployed Deals"; can fund it

### Approval & Release
- All three parties can call `approveRelease` on the escrow contract
- 2-of-3 approvals automatically releases funds to freelancer
- All portals show approval progress (3 filled dots, X/3)

### On-Chain Cancellation
- Any of the 3 parties can call `approveCancellation` on the escrow contract
- 2-of-3 cancel approvals: sets `isCancelled = true`, refunds full balance to buyer (client)
- Mutually exclusive with release: a wallet that approved release cannot approve cancellation and vice versa
- All portals show cancel approval progress (3 filled dots) and enforce mutual exclusivity in UI

### CPRA Compliance Ledger (Arbiter)
- On-chain audit trail via `CPRALedger` contract
- **Locked until deal outcome is determined** — CPRA section shows "Awaiting deal outcome" until `isReleased` or `isCancelled` is true
- **Released path (3 steps):** Register Case → Record Deposit → Finalize Case (disburse + close in one TX)
- **Cancelled path (2 steps):** Register Case → Close Cancelled Case (no disbursement; records refund closure)
- Progress persisted to Supabase `cpra_ledger_progress` table (`closed = true` marks completion for both paths)

### Document Access
- `GET /api/deals/[id]/document?wallet_address=` returns a 1-hour Supabase signed URL
- Access is limited to the three parties of the deal (client, freelancer, arbiter)

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| wallet_address | text | unique, lowercase |
| role | text | `client` / `freelancer` / `arbiter` |
| created_at | timestamptz | |

### `deals`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| deal_code_id | text | short alphanumeric ID |
| client_address | text | |
| freelancer_address | text | |
| arbiter_address | text | |
| document_hash | text | `0x` + SHA256 of file bytes |
| form_data | jsonb | `{ type:'file', filename, storage_path, amount }` |
| status | text | `pending_acceptance` / `accepted` / `deployed` / `cancelled` |
| arbiter_accepted | boolean | |
| freelancer_accepted | boolean | |
| escrow_address | text | set after on-chain deploy |
| created_at | timestamptz | |

### `cpra_ledger_progress`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| escrow_address | text | unique |
| arbiter_address | text | |
| registered | boolean | |
| deposit_recorded | boolean | |
| disbursement_recorded | boolean | |
| closed | boolean | |
| updated_at | timestamptz | |

---

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/users/register` | none | Register wallet + role |
| GET | `/api/users/[wallet]` | none | Get user by wallet |
| POST | `/api/deals` | none (validated by client_address role) | Create deal |
| GET | `/api/deals` | none | List deals for wallet |
| POST | `/api/deals/upload` | none | Upload file to Supabase Storage |
| GET | `/api/deals/[id]/document` | party check | Get signed URL |
| POST | `/api/deals/[id]/accept` | party check | Accept deal |
| POST | `/api/deals/[id]/reject` | party check | Reject deal |
| PATCH | `/api/deals/[id]/deploy` | arbiter check | Mark deployed |
| GET | `/api/deals/by-hash/[hash]` | none | Lookup by document hash |
| GET | `/api/ledger/[escrow]` | none | Get CPRA progress |
| PUT | `/api/ledger/[escrow]` | none | Update CPRA progress |

---

## File Storage

- Bucket: `deal-documents` (private, Supabase Storage)
- Path format: `{wallet_lower}/{timestamp}-{filename}`
- Access: service role only (server-side); signed URLs issued per request (1 hr expiry)
- Max file size: 10 MB

---

## On-Chain Contracts

| Contract | Address source | Purpose |
|----------|---------------|---------|
| `EscrowFactory` | `FACTORY_ADDRESS` in `abis.ts` | Creates escrow instances |
| `Escrow` | deployed per deal | Holds funds, tracks approvals + cancellations (2/3) |
| `CPRALedger` | `LEDGER_ADDRESS` in `abis.ts` | Compliance audit trail |

### Current Deployed Addresses (Polkadot EVM Testnet — Chain ID 420420417)
| Contract | Address |
|----------|---------|
| EscrowFactory | `0x103787ebcdED73f3F4B2390D822bacF3a29Ae134` |
| CPRALedger | `0x98F6a19b499dA372F2d780Ab9568A1F81E58501c` |

Addresses are written to `legal-escrow-dapp/.env.local` as `NEXT_PUBLIC_FACTORY_ADDRESS` / `NEXT_PUBLIC_LEDGER_ADDRESS` by `backend/scripts/deploy.js`. Fallbacks are hardcoded in `src/contracts/abis.ts`.

Supported networks: Polkadot EVM Testnet (420420417), Hardhat local (31337), Sepolia (11155111).
