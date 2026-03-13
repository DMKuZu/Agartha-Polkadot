# Requirements

All library versions required to run the AgarthaTech Legal Escrow dApp.

---

## System Requirements

| Tool | Version |
|------|---------|
| Node.js | v22.21.1 |
| npm | 10.9.4 |
| Solidity | 0.8.28 |

---

## Network Configuration

### Hardhat Local (development)

| Field | Value |
|-------|-------|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency Symbol | `ETH` |

### Sepolia Testnet (Ethereum)

| Field | Value |
|-------|-------|
| Network Name | Sepolia |
| Chain ID | `11155111` |
| Currency Symbol | `ETH` |

### Polkadot Paseo Testnet (target production network)

| Field | Value |
|-------|-------|
| Network Name | Polkadot EVM Testnet |
| RPC URL | `https://eth-rpc-testnet.polkadot.io/` |
| Chain ID | `420420417` |
| Currency Symbol | `PAS` |
| Block Explorer | `https://blockscout-testnet.polkadot.io` |

> Add the Paseo network to MetaMask manually using the values above.

---

## Frontend — `legal-escrow-dapp/`

### Dependencies

| Package | Version |
|---------|---------|
| `next` | 16.1.6 |
| `react` | 19.2.3 |
| `react-dom` | 19.2.3 |
| `wagmi` | ^2.19.5 |
| `viem` | ^2.47.0 |
| `@rainbow-me/rainbowkit` | ^2.2.10 |
| `@tanstack/react-query` | ^5.90.21 |
| `@walletconnect/ethereum-provider` | ^2.23.7 |
| `crypto-js` | ^4.2.0 |
| `@supabase/supabase-js` | ^2.49.0 |

### Dev Dependencies

| Package | Version |
|---------|---------|
| `typescript` | ^5 |
| `tailwindcss` | ^4 |
| `@tailwindcss/postcss` | ^4 |
| `eslint` | ^9 |
| `eslint-config-next` | 16.1.6 |
| `@types/node` | ^20 |
| `@types/react` | ^19 |
| `@types/react-dom` | ^19 |
| `@types/crypto-js` | ^4.2.2 |

Install with:
```bash
cd legal-escrow-dapp
npm install
```

---

## Backend — `backend/`

### Dev Dependencies

| Package | Version |
|---------|---------|
| `hardhat` | ^2.28.6 |
| `@nomicfoundation/hardhat-toolbox` | ^6.1.2 |
| `@nomicfoundation/hardhat-ethers` | ^3.1.3 |
| `@nomicfoundation/hardhat-ignition` | ^0.15.16 |
| `@nomicfoundation/hardhat-ignition-ethers` | ^0.15.17 |
| `@nomicfoundation/hardhat-network-helpers` | ^1.1.2 |
| `@nomicfoundation/hardhat-chai-matchers` | ^2.1.2 |
| `@nomicfoundation/hardhat-verify` | ^2.1.3 |
| `ethers` | ^6.16.0 |
| `typechain` | ^8.3.2 |
| `@typechain/hardhat` | ^9.1.0 |
| `@typechain/ethers-v6` | ^0.5.1 |
| `chai` | ^4.5.0 |
| `hardhat-gas-reporter` | ^2.3.0 |
| `solidity-coverage` | ^0.8.17 |

Install with:
```bash
cd backend
npm install
```
