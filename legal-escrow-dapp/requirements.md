# Requirements

Functional requirements for the Legal Escrow DApp.

---

## User Roles

- **Client**: Creates deals, uploads the agreement document, funds the escrow, approves payment release
- **Freelancer**: Reviews and accepts/rejects deals, approves payment release
- **Arbiter**: Reviews and accepts/rejects deals, deploys the escrow smart contract, approves payment release, records CPRA compliance steps

Each wallet registers once with exactly one role. Pages are role-gated.

---

## Deal Creation

- Client provides:
  - **Freelancer Wallet Address** (required, must be a registered freelancer)
  - **Arbiter Wallet Address** (required, must be a registered arbiter)
  - **Settlement Amount** in PAS (required, > 0)
  - **Agreement Document** (required, any file type, max 10 MB)
- All three parties must be different wallet addresses
- Document is uploaded to Supabase Storage; SHA256 hash is stored in DB and recorded on-chain as proof

---

## Acceptance Workflow

- Deal starts with `status = 'pending_acceptance'`
- Both arbiter and freelancer must independently accept before deployment
- Either party can reject, causing `status = 'cancelled'`
- When both accept: `status = 'accepted'`
- Client sees status on their pending deals list

---

## Deployment

- Arbiter deploys the escrow smart contract once deal is `accepted`
- Contract is pre-filled with client address (buyer), freelancer address (seller), arbiter address (lawyer), amount, and document hash
- After deployment, deal `status = 'deployed'` and `escrow_address` is stored

---

## Escrow Lifecycle

1. **Fund**: Client deposits settlement amount into escrow contract
2. **Approve**: Each party (client, freelancer, arbiter) can call `approveRelease`
3. **Release**: Funds release automatically when 2-of-3 approvals are reached
4. Freelancer receives payment to their wallet

---

## Document Access

- All three parties can view/download the agreement document at any point
- Access is via short-lived signed URLs (1-hour expiry)
- Document is never publicly accessible; access requires being a verified party

---

## CPRA Compliance (Arbiter)

- Arbiter records each phase on-chain via `CPRALedger` contract:
  1. Register Case
  2. Record Deposit (available after funded)
  3. Record Disbursement (available after released)
  4. Close Case (available after disbursement recorded)
- Progress is also persisted off-chain in Supabase for display

---

## Global Case Ledger

- Public dashboard at `/dashboard` showing all deployed escrow cases
- Accessible from all role portals via "View Global Case Ledger →" link

---

## Non-Functional Requirements

- No account/password — wallet-only authentication
- All sensitive file access goes through server-side API routes (service role key never exposed client-side)
- Document hash anchored on-chain provides tamper-proof proof of agreement
- App works on Polkadot EVM Testnet, Hardhat local, and Sepolia
