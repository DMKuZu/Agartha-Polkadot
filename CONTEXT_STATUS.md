# CONTEXT_STATUS

Current implementation state of the Legal Escrow DApp.

---

## Project Status

**Overall State:** PRODUCTION-READY on Polkadot EVM Testnet (Chain ID 420420417)

All core features are fully implemented and tested. The system is actively deployed and operational.

---

## Completed Features

### User Registration ✅
- Wallets register with a role: `client`, `freelancer`, or `arbiter`
- Role stored in Supabase `users` table
- `RoleGuard` component redirects to registration if role doesn't match the page
- Wallet address validation on connection

### Deal Creation (Client) ✅
- Client selects freelancer + arbiter by wallet address
- Inline address validation: checks role in DB on blur
- Uploads agreement document (any file type, max 10 MB) to Supabase Storage bucket `deal-documents`
- SHA256 hash computed server-side, stored in `deals.document_hash` and recorded on-chain
- `form_data` JSONB: `{ type: 'file', filename, storage_path, amount }`
- Deal created with `status: 'pending_acceptance'`, `arbiter_accepted: false`, `freelancer_accepted: false`

### Acceptance Workflow ✅
- **Freelancer portal**: "Pending Acceptance" queue shows deals where `status = 'pending_acceptance'`
  - Can review filename + view/download document via 1-hour signed URL
  - Accept → `freelancer_accepted = true`; Reject → `status = 'cancelled'`
- **Arbiter portal**: same queue with same actions
  - When both accept → `status = 'accepted'` + moved to "Ready to Deploy"

### Deploy & Fund ✅
- Arbiter deploys escrow smart contract (pre-filled from deal)
- `PATCH /api/deals/[id]/deploy` updates DB with `escrow_address` + `status: 'deployed'`
- Client sees deployed deal in "My Deployed Deals"; can fund it

### Approval & Release ✅
- All three parties can call `approveRelease` on the escrow contract
- 2-of-3 approvals automatically releases funds to freelancer
- All portals show approval progress (X/3 approvals)
- Mutual exclusivity enforced: wallet approving release cannot approve cancellation

### On-Chain Cancellation ✅
- Any of the 3 parties can call `approveCancellation` on the escrow contract
- 2-of-3 cancel approvals: sets `isCancelled = true`, refunds full balance to buyer (client)
- Mutually exclusive with release: a wallet that approved release cannot approve cancellation and vice versa
- All portals show cancel approval progress and enforce mutual exclusivity in UI

### CPRA Compliance Ledger (Arbiter) ✅
- On-chain audit trail via `CPRALedger` contract
- **Locked until deal outcome is determined** — CPRA section shows "Awaiting deal outcome" until `isReleased` or `isCancelled` is true
- **Released path (3 steps):** Register Case → Record Deposit → Finalize Case (disburse + close in one TX)
- **Cancelled path (2 steps):** Register Case → Close Cancelled Case (no disbursement; records refund closure)
- Progress persisted to Supabase `cpra_ledger_progress` table (`closed = true` marks completion for both paths)

### Document Access & Viewing ✅
- `GET /api/deals/[id]/document?wallet_address=` returns a 1-hour Supabase signed URL
- Access is limited to the three parties of the deal (client, freelancer, arbiter)
- View Document toggle button integrated in all portals (Client, Freelancer, Arbiter)
- Download/view functionality with signed URLs

### Deal Status & Badge Indicators ✅
- **Database status values:** `pending_acceptance`, `accepted`, `deployed`, `cancelled`
- **On-chain status badges:** "Awaiting Funding", "Funded — X/3 approvals", "Released", "Cancelled"
- **CPRA badges:** "CPRA Filed" (indigo - when ledger.closed=true), "CPRA Pending" (amber - when released/cancelled but ledger not closed)
- Badge components in all portals showing current state with proper priority ordering

### Data Fetching & Multicall ✅
- Uses `wagmi` `useReadContracts()` for efficient batch reads
- **Client portal:** reads 11 values per escrow (buyer, seller, settlementAmount, isFunded, isReleased, approvalCount, hasApproved, documentHash, isCancelled, cancelApprovalCount, hasCancelApproved)
- **Freelancer portal:** reads 12 values per escrow
- **Arbiter portal:** reads 9 values per case
- **Dashboard:** reads 3 values per escrow (isFunded, isReleased, isCancelled)
- Dependency array stabilization using `JSON.stringify()` to prevent unnecessary re-renders

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
| closed | boolean | marks completion for both release & cancelled flows |
| updated_at | timestamptz | |

---

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/users/register` | none | Register wallet + role |
| GET | `/api/users/[wallet]` | none | Get user by wallet (case-insensitive) |
| POST | `/api/deals` | client role | Create deal with all three parties |
| GET | `/api/deals` | none | List deals for wallet (any party) |
| POST | `/api/deals/upload` | none | Upload file to Supabase Storage, return SHA256 hash |
| GET | `/api/deals/[id]/document` | party check | Get 1-hour signed URL for document |
| POST | `/api/deals/[id]/accept` | party check | Accept deal (arbiter or freelancer) |
| POST | `/api/deals/[id]/reject` | party check | Reject deal, set status to cancelled |
| PATCH | `/api/deals/[id]/deploy` | arbiter check | Mark deployed, store escrow address |
| DELETE | `/api/deals/[id]` | client check | Delete cancelled deal (pre-deployment only) |
| GET | `/api/deals/by-hash/[hash]` | none | Lookup deal by document hash |
| GET | `/api/deals/by-escrow/[address]` | none | Lookup deal by escrow address |
| GET | `/api/ledger/[escrow]` | none | Get CPRA progress |
| PUT | `/api/ledger/[escrow]` | none | Update CPRA progress (monotonic OR) |

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

---

## Recent Changes & Fixes

### View Document Button Implementation ✅
- **Commit:** 9fc8041
- **Change:** Full integration of document viewing across all portals with signed URLs
- **Impact:** Users can now view/download agreements from any portal
- **Note:** Requires deal to be in Supabase DB (see Known Issues)

### Dependency Array Stabilization ✅
- **Files affected:** `arbiter/page.tsx`, `freelancer/page.tsx`, `client/page.tsx`
- **Change:** Replaced unstable `.map().join()` pattern with `JSON.stringify()` in useEffect dependencies
- **Impact:** Prevents unnecessary re-renders and race conditions in deal info fetching
- **Result:** Deal data now fetches reliably for all cases

### CPRA Cancelled Case Closure ✅
- **Commit:** 9579838
- **Change:** Added `closeCancelledCase` function and updated CPRA UI
- **Impact:** Arbiter can now properly close cancelled cases in the CPRA ledger
- **Flow:** Register Case → Close Cancelled Case (no disbursement)

### Status Badge Enhancements ✅
- **Change:** Added `isCancelled` to all multicall reads across portals
- **Impact:** Cancelled deals now show correct badge (red) instead of "Funded"
- **Added:** CPRA status badges showing "CPRA Filed" or "CPRA Pending" for completed deals

---

## Known Issues & Limitations

### Issue #1: Externally Deployed Contracts Missing from DB ⚠️
**Status:** KNOWN / WORKAROUND EXISTS
- **Problem:** If a contract is deployed outside the normal app flow (bypassing `/api/deals/[id]/deploy`), it won't have a row in the Supabase `deals` table
- **Symptom:** View Document button won't appear for such contracts
- **Console log:** "by-escrow returned no deal" or "by-hash returned no deal"
- **Workaround:** Implement deal synchronization or allow users to manually link contracts
- **Current behavior:** Fallback to `by-hash` lookup, but if document hash doesn't match DB, still no button
- **Note:** First, middle, and last cases in a typical session may show this if they were deployed outside the normal workflow

### Issue #2: Debug Logging in Arbiter Page ✅
**Status:** RESOLVED
- **File:** `src/app/arbiter/page.tsx`
- **Change:** Removed all `console.log()` debug statements from caseDealInfo fetching useEffect
- **Impact:** Production-clean output; no functional change

### Issue #3: RoleGuard Redirect Timing ℹ️
**Status:** MINOR / ACCEPTABLE
- **Problem:** RoleGuard redirects immediately on wallet connection match; rapid user interaction may cause unexpected behavior
- **Impact:** Negligible - redirect happens within useEffect with proper timing
- **Note:** Not a blocker; user experience is acceptable

---

## Test Coverage

### Tested Flows ✅
- Complete deal creation through approval
- Cancellation workflow with mutual exclusivity
- CPRA ledger recording (both release and cancel paths)
- Document upload and viewing
- Role-based access control
- Multi-signature approval logic

### Deployment Status
- **Mainnet:** Not deployed
- **Testnet (Polkadot EVM):** ✅ Active and tested
- **Sepolia:** Previously deployed, no longer in active config
- **Hardhat:** Available for local development

---

## Next Steps / Future Improvements

1. **Enhancement:** Handle externally deployed contracts (sync DB or manual linking)
2. **Feature:** Auto-sync deals when contract is first detected on-chain
3. **Performance:** Consider caching for CPRA ledger queries
4. **UX:** Add more detailed error messages for wallet/party mismatches

---

## Development Notes

- **Frontend Framework:** Next.js 16.1.6 with App Router
- **Web3 Integration:** wagmi 2.19.5 + viem 2.47.0
- **State Management:** React hooks + TanStack Query
- **Database:** Supabase PostgreSQL
- **Smart Contracts:** Solidity 0.8.28, deployed via Hardhat
- **Authentication:** Web3 wallet-only (MetaMask, Talisman, WalletConnect)

All changes compile without TypeScript errors (`tsc --noEmit` → EXIT:0).
