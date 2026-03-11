# AgarthaTech — Decentralized Legal Escrow

A trustless, decentralized legal escrow service for the freelance economy. Bridges legally binding Philippine digital agreements with blockchain-enforced payments.

Built on Polkadot (Paseo Testnet) with Solidity smart contracts, Next.js frontend, and wallet-based authentication.

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
- Ricardian Contract Generator — form-based Philippine Freelance Service Agreement with auto-generated cryptographic hash
- Deal Code System — Client generates a portable base64 code and shares it with their Arbiter out-of-band; no shared state required
- Smart Contract Factory — deploys a unique escrow vault per agreement
- Multi-signature Escrow — 2-of-3 approval (Client + Freelancer + Arbiter) to release funds
- Agreement Viewing — all three parties can view the full rendered Ricardian contract; Freelancer imports it via an Agreement Code from the Arbiter
- CPRA-compliant Ledger — on-chain audit trail; the Arbiter who deployed the escrow manages their own case entries (no deployer wallet needed)
- Global Case Ledger — public read-only dashboard showing Case ID and status per escrow, accessible from the landing page

---

## Prerequisites

- Node.js v22+ and npm 10+
- MetaMask browser extension
- See `requirements.md` for full library versions

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

## Testing Locally (MetaMask + Hardhat)

### Step 1 — Add Hardhat network to MetaMask (one-time)

Open MetaMask → Settings → Networks → Add a network manually:

| Field | Value |
|-------|-------|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency Symbol | `ETH` |

### Step 2 — Import test wallets into MetaMask (one-time per session)

You need 3 MetaMask accounts — one each for Client, Freelancer, and Arbiter. After running `npx hardhat node` in Step 3, the terminal prints 20 accounts with private keys. Import any 3:

MetaMask → click account icon → Import Account → paste private key.

### Step 3 — Start the local blockchain

```bash
cd backend
npx hardhat node
```

Keep this terminal running. It logs all transactions in real time.

### Step 4 — Deploy contracts to local network

Open a second terminal:

```bash
cd backend
npx hardhat run scripts/deploy.js --network localhost
```

This deploys `LegalFactory` and `CPRALedger`, then automatically writes their addresses to `legal-escrow-dapp/.env.local`.

### Step 5 — Start the frontend

Open a third terminal:

```bash
cd legal-escrow-dapp
npm run dev
```

Open `http://localhost:3000` in your browser. Make sure MetaMask is switched to the **Hardhat Local** network.

### ⚠️ MetaMask nonce reset (required after every `hardhat node` restart)

When `npx hardhat node` restarts, the chain resets to block 0 but MetaMask still caches old nonces for each account — this causes all transactions to hang silently.

**Do this for every Hardhat account imported into MetaMask, before submitting any transaction:**
MetaMask → click the account → three-dot menu → Settings → Advanced → **Clear activity and nonce data**

---

## Testing on Sepolia Testnet

If `.env.local` is absent, the app falls back to the already-deployed Sepolia contracts automatically.

1. Switch MetaMask to the **Sepolia** network
2. Get Sepolia ETH from a faucet
3. Run the frontend: `cd legal-escrow-dapp && npm run dev`

**Deployed Sepolia addresses:**
- `LegalFactory`: `0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7`
- `CPRALedger`: `0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1` ⚠️ stale — this is the old contract without self-registering arbiter support; redeploy with `npx hardhat run scripts/deploy.js --network sepolia` and update `.env.local` to use CPRA ledger features on Sepolia

---

## Testing on Polkadot Paseo Testnet

> Paseo Testnet chain details — see `requirements.md` for RPC URL and chain ID.

1. Add the Paseo EVM network to MetaMask using the details in `requirements.md`
2. Get PAS testnet tokens from the Paseo faucet
3. Deploy contracts to Paseo (add network entry to `hardhat.config.js`)
4. Run the frontend: `cd legal-escrow-dapp && npm run dev`

---

## End-to-End Settlement Flow

### 1. Onboarding
All three parties open `http://localhost:3000`, connect their wallet, and select their role (Client / Freelancer / Arbiter).

### 2. Client creates the project request (`/client`)
- Fills out the Ricardian Contract form: project title, deliverables, deadline, PAS amount, Freelancer wallet address
- A Philippine Freelance Service Agreement is generated from the form inputs with a unique cryptographic hash
- Client clicks **Generate Deal Code** — a base64 encoded string containing the full deal payload is displayed
- Client copies the code and sends it to their chosen Arbiter through any secure channel (email, chat, etc.)

### 3. Arbiter reviews and deploys (`/arbiter`)
- Arbiter pastes the deal code into the "Load Deal from Code" input and clicks **Load**
- The deal appears in the Arbiter's private queue — only this browser/device can see it
- Arbiter expands the deal to read the full contract terms, then clicks **Deploy** to pre-fill the deploy form
- Arbiter clicks **Deploy Smart Contract** — calls `Factory.createCase()` on-chain
- After deployment, the case card shows a **Copy Agreement Code** button — Arbiter shares this code with the Freelancer so they can view the signed contract terms

### 4. Client funds escrow (`/client`)
- The escrow address appears in Client's "My Deals" list (loaded from the factory on-chain)
- Client clicks **Deposit PAS** — sends the exact settlement amount to the escrow vault

### 5. Freelancer imports agreement and approves (`/freelancer`)
- Freelancer sees their active contracts in "My Contracts"
- Pastes the Agreement Code from the Arbiter to import and view the full rendered Ricardian contract
- After delivering the work, clicks **Approve Release**

### 6. Client and Arbiter approve
- Client and Arbiter each connect and click **Approve Release** on their respective pages
- Funds auto-release to the Freelancer once 2 of 3 parties have approved

### 7. Arbiter records to CPRA Ledger (`/arbiter`)
- Arbiter completes the 4-step compliance record: Register → Deposit → Disbursement → Close
- Each step is gated by on-chain state (e.g. Deposit requires `isFunded`, Disbursement requires `isReleased`)
- The Arbiter's wallet is self-authorized — no deployer wallet required

### Dispute path
If Client and Freelancer disagree, the Arbiter's single approval (combined with one of the two parties) constitutes the 2-of-3 majority, resolving the dispute.
