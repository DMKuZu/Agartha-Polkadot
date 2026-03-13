# Legal Escrow DApp

A decentralized escrow application built on Polkadot EVM (Asset Hub Testnet). Clients upload agreement documents, assign a freelancer and arbiter, and lock funds in a smart contract that releases upon 2-of-3 approval.

---

## Architecture Overview

```
Client → uploads document + sets parties → Arbiter & Freelancer accept/reject
→ Arbiter deploys escrow contract → Client funds it → All 3 parties approve release
→ Funds sent to Freelancer
```

- **Frontend**: Next.js 14 (App Router) + React + Tailwind CSS
- **Wallet**: RainbowKit + wagmi + viem
- **Off-chain DB**: Supabase (users, deals, CPRA ledger)
- **File Storage**: Supabase Storage (`deal-documents` bucket, private)
- **On-chain**: Solidity contracts deployed on Polkadot EVM Testnet (chain ID 420420417)

---

## Roles

| Role | What they do |
|------|-------------|
| **Client** | Creates deals, uploads document, funds escrow, approves release |
| **Freelancer** | Accepts/rejects deals, approves payment release |
| **Arbiter** | Accepts/rejects deals, deploys escrow contract, approves release, manages CPRA ledger |

---

## Supabase Setup

### 1. Run the SQL schema

In your Supabase project → SQL Editor, run:

```sql
-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('client', 'freelancer', 'arbiter')),
  created_at timestamptz DEFAULT now()
);

-- Deals
CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_code_id text,
  client_address text NOT NULL,
  freelancer_address text NOT NULL,
  arbiter_address text,
  document_hash text NOT NULL,
  form_data jsonb,
  status text NOT NULL DEFAULT 'pending_acceptance'
    CHECK (status IN ('pending', 'pending_acceptance', 'accepted', 'deployed', 'cancelled')),
  arbiter_accepted boolean NOT NULL DEFAULT false,
  freelancer_accepted boolean NOT NULL DEFAULT false,
  escrow_address text,
  created_at timestamptz DEFAULT now()
);

-- CPRA Ledger progress
CREATE TABLE cpra_ledger_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_address text UNIQUE NOT NULL,
  arbiter_address text,
  registered boolean DEFAULT false,
  deposit_recorded boolean DEFAULT false,
  disbursement_recorded boolean DEFAULT false,
  closed boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
```

### 2. Create Storage bucket

In Supabase → Storage, create a bucket named `deal-documents`:
- **Private** (RLS enabled or service role only)
- Allowed MIME types: all (`*`)
- Max file size: 10 MB

### 3. Set environment variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key — Project Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret — Project Settings → API>
```

> `SUPABASE_SERVICE_ROLE_KEY` is only used server-side in API routes. Never expose it client-side.

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/register` | Register wallet with role |
| GET | `/api/users/[wallet]` | Look up user by wallet address |
| POST | `/api/deals` | Client creates a deal |
| GET | `/api/deals?wallet_address=` | List deals for a wallet |
| POST | `/api/deals/upload` | Upload agreement document to Supabase Storage |
| GET | `/api/deals/[id]/document?wallet_address=` | Get 1-hour signed URL for document |
| POST | `/api/deals/[id]/accept` | Arbiter or freelancer accepts a deal |
| POST | `/api/deals/[id]/reject` | Arbiter or freelancer rejects a deal |
| PATCH | `/api/deals/[id]/deploy` | Mark deal as deployed (called after on-chain deploy) |
| GET | `/api/deals/by-hash/[hash]` | Look up deal by document hash |
| GET/PUT | `/api/ledger/[escrow]` | Read or update CPRA ledger progress |

---

## Deal Workflow

1. **Client** registers, connects wallet, creates a deal:
   - Enters Freelancer wallet address, Arbiter wallet address, Settlement Amount (PAS)
   - Uploads agreement document (any file, max 10 MB)
   - Document is stored in Supabase Storage; SHA256 hash recorded on-chain
2. **Freelancer** and **Arbiter** see the deal in their "Pending Acceptance" queue
   - Both can view/download the document via signed URL
   - Each accepts or rejects
3. When **both accept** → status becomes `accepted` → appears in Arbiter's "Ready to Deploy"
4. **Arbiter** deploys the escrow smart contract (pre-filled from deal data)
5. **Client** funds the escrow (deposits settlement amount)
6. All three parties approve release (2-of-3 threshold releases funds automatically)
7. **Arbiter** optionally records CPRA compliance steps on-chain

---

## Smart Contracts

Deployed to Polkadot EVM Testnet (chain ID 420420417), Hardhat local (31337), and Sepolia (11155111).

- `EscrowFactory` — deploys individual escrow contracts
- `Escrow` — holds funds, tracks approvals, releases on 2/3
- `CPRALedger` — on-chain audit trail for compliance steps

Contract addresses are set in `src/contracts/abis.ts`.
