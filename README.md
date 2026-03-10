# Agartha - Polkadot

With the help of Gemini and Claude, we have built an Escrow, Ledger, and a Contract Factory.

---

## Features

- CPRA-compliant Ledger
- Multi-signature Escrow
- Smart Contract Factory
- Ricardian Contract Generator

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

You need 3 MetaMask accounts to simulate buyer, seller, and lawyer. After running `npx hardhat node` in Step 3, the terminal will print 20 accounts with private keys. Import any 3 of them:

MetaMask → click account icon → Import Account → paste private key.

### Step 3 — Start the local blockchain

```bash
cd backend
npx hardhat node
```

Keep this terminal running. It will log all transactions in real time.

### Step 4 — Deploy contracts to local network

Open a second terminal:

```bash
cd backend
npx hardhat run scripts/deploy.js --network localhost
```

This deploys `LegalFactory` and `CPRALedger`, then automatically writes their addresses to `legal-escrow-dapp/.env.local`. No manual address copying needed.

### Step 5 — Start the frontend

Open a third terminal:

```bash
cd legal-escrow-dapp
npm run dev
```

Open `http://localhost:3000` in your browser. Make sure MetaMask is switched to the **Hardhat Local** network.

---

## Testing on Sepolia Testnet

If `.env.local` is absent, the app falls back to the already-deployed Sepolia contracts automatically.

1. Switch MetaMask to the **Sepolia** network
2. Get Sepolia ETH from a faucet
3. Run the frontend: `cd legal-escrow-dapp && npm run dev`

**Deployed Sepolia addresses:**
- `LegalFactory`: `0x688c0611a5691B7c1F09a694bf4ADfb456a58Cf7`
- `CPRALedger`: `0x4815A8Ba613a3eB21A920739dE4cA7C439c7e1b1`

---

## End-to-End Settlement Flow

1. **Connect wallet** — click Connect in the top right (use the lawyer account)
2. **Upload PDF** — upload the settlement agreement; a SHA256 hash is generated in-browser
3. **Deploy case** — fill in buyer and seller wallet addresses and settlement amount, click Deploy Case
4. **Fund escrow** — switch to the buyer account and deposit the settlement amount
5. **Approve release** — each party (buyer, seller, lawyer) connects and clicks Approve Release
6. **Settlement complete** — funds transfer to the seller automatically once 2 of 3 parties approve
