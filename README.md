# AgarthaTech — Decentralized Legal Escrow

A trustless, decentralized legal escrow service for the freelance economy. Bridges legally binding Philippine digital agreements with blockchain-enforced payments.

Built on Polkadot (Paseo Testnet) with Solidity smart contracts, Next.js frontend, and wallet-based authentication.

**Status:** Production-ready on Polkadot EVM Testnet (Chain ID 420420417). All core features fully implemented and tested. See [CONTEXT_STATUS.md](./CONTEXT_STATUS.md) for current deployment status, completed features, and known issues.

---

## Roles

| Role | Description |
|------|-------------|
| **Client** | Hires a freelancer, funds the escrow, approves work delivery |
| **Freelancer** | Delivers the work, receives payment upon 2-of-3 approval |
| **Arbiter** | Philippine-credentialed legal professional who reviews and deploys the contract, acts as tiebreaker in disputes |

---

## Features

- Role-based onboarding — each party selects their role on connecting their wallet
- File-based Agreement Upload — Client uploads a Philippine Freelance Service Agreement document; SHA256 hash stored on-chain for verification
- Deal Acceptance Layer — Freelancer and Arbiter accept the deal in the database before smart contract deployment
- Smart Contract Factory — deploys a unique escrow vault per agreement
- Multi-signature Escrow — 2-of-3 approval (Client + Freelancer + Arbiter) to release funds; automatic fund transfer on second approval
- Agreement Viewing — all three parties can view and download the uploaded agreement document with SHA256 verification
- CPRA-compliant Ledger — on-chain audit trail; the Arbiter records case registration, deposit, and final disbursement (3 steps for released, 2 for cancelled)
- Global Case Ledger — public read-only dashboard showing Case ID and status per escrow, accessible from the landing page

---

## Prerequisites

- Node.js v22+ and npm 10+
- MetaMask browser extension
- See [requirements.md](./requirements.md) for full library versions

---

## Installation

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../legal-escrow-dapp
npm install
```

---

## Deploying and Testing on Polkadot Paseo Testnet

The frontend targets Polkadot EVM Testnet. Use this to deploy contracts and run the app end-to-end.

### Step 1 — Get PAS testnet tokens

Visit the Paseo faucet and fund your deployer wallet with PAS.

### Step 2 — Add deployer key to backend

Create `backend/.env`:
```
DEPLOYER_PRIVATE_KEY=0x<your_deployer_private_key>
```

`hardhat.config.js` reads this key for the `polkadotTestnet` network entry automatically.

### Step 3 — Deploy contracts

```bash
cd backend
npx hardhat run scripts/deploy.js --network polkadotTestnet
```

This deploys `LegalFactory` and `CPRALedger` to Paseo Testnet and auto-writes their addresses to `legal-escrow-dapp/.env.local`, preserving any existing keys (Supabase credentials).

### Step 4 — Add Polkadot EVM Testnet to MetaMask (one-time)

| Field | Value |
|-------|-------|
| Network Name | Polkadot EVM Testnet |
| RPC URL | `https://eth-rpc-testnet.polkadot.io/` |
| Chain ID | `420420417` |
| Currency Symbol | `PAS` |
| Block Explorer | `https://blockscout-testnet.polkadot.io` |

### Step 5 — Start the frontend

```bash
cd legal-escrow-dapp
npm run dev
```

Open `http://localhost:3000`. MetaMask should show **Polkadot EVM Testnet**.

---

## End-to-End Settlement Flow

### 1. Onboarding
All three parties open `http://localhost:3000`, connect their wallet, and select their role (Client / Freelancer / Arbiter).

### 2. Client creates the deal (`/client`)
- Selects Freelancer wallet address, Arbiter wallet address, settlement amount (in PAS)
- Uploads the Philippine Freelance Service Agreement document
- Clicks **Submit Deal for Review**
- Deal saved to Supabase `deals` table with `status: pending_acceptance`
- Appears in Freelancer and Arbiter's review queues

### 3. Freelancer and Arbiter accept (`/freelancer` and `/arbiter`)
- Freelancer reviews the uploaded agreement and clicks **Accept**
- Arbiter reviews the uploaded agreement and clicks **Accept**
- Backend reaches `status: accepted` (both parties have consented)
- Deal now appears in Arbiter's "Ready to Deploy" queue

### 4. Arbiter deploys smart contract (`/arbiter`)
- Arbiter clicks **Deploy Smart Contract** → calls `Factory.createCase()` on-chain
- Backend creates escrow contract, stores `escrow_address`, changes `status: deployed`
- Deal appears in Arbiter's "My Cases" queue; no longer in pending queue

### 5. Client funds escrow (`/client`)
- Escrow address appears in Client's "My Deployed Deals" list
- Client clicks **Deposit PAS** — sends exact settlement amount to escrow vault
- On-chain state: `isFunded = true`

### 6. All parties approve release (`/client`, `/freelancer`, `/arbiter`)
- Freelancer, Client, and/or Arbiter click **Approve Release** on their respective pages
- Each approval increments `approvalCount` on-chain
- Once `approvalCount >= 2`, funds automatically release to Freelancer wallet
- On-chain state: `isReleased = true`

### 7. Arbiter records to CPRA Ledger (`/arbiter`) — Released Deal Path
- **Step 1 (Register):** Arbiter clicks **Register Case** → calls `CPRALedger.registerCase()`
- **Step 2 (Record Deposit):** Arbiter clicks **Record Deposit** → records funding amount
- **Step 3 (Finalize):** Arbiter clicks **Finalize Case** → calls `CPRALedger.finalizeCase()` (combines disbursement + close in one transaction)
- Each step gates on-chain state (Register requires contract exists, Record Deposit requires `isFunded`, Finalize requires `isReleased`)

### 7b. Alternative: Arbiter records cancelled deal (if cancellation occurred)
- **Step 1 (Register):** Arbiter clicks **Register Case**
- **Step 2 (Close Cancelled):** Arbiter clicks **Close Cancelled Case** → closes without disbursement payment
- (Payment already returned to Client on-chain during 2-of-3 cancel approval)

### Dispute Path
If Client and Freelancer disagree:
- Any party can call `approveCancellation()` instead of `approveRelease()`
- Arbiter's single cancellation approval (combined with one of the two parties) = 2-of-3 majority
- Funds refund to Client; escrow closes
- Arbiter then records cancellation via CPRA ledger (2-step path above)
