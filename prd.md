Product Requirements Document (PRD): AgarthaTech
1. Product Overview
Name: AgarthaTech
Platform: Web Application (dApp)
Network: Polkadot (Paseo Testnet - EVM Compatible Layer)
Core Mission: To provide a trustless, decentralized legal escrow service for the freelance economy, bridging legally binding Philippine digital agreements with blockchain-enforced payments.

2. Target Audience
The Client (Buyer): Individuals or businesses looking to hire freelancers safely, ensuring their funds are only released when the agreed-upon work is delivered.

The Freelancer (Seller): Independent contractors seeking guaranteed payment upon successful completion of a project, eliminating the risk of "ghosting."

The Arbiter (Lawyer/Legal Professional): Philippine-credentialed legal experts who facilitate the creation of the contract and act as the tie-breaking vote in case of a dispute.

3. Core Features & Technical Components
Web3 Authentication (Next.js Frontend): Users log in exclusively via Web3 wallets (e.g., MetaMask, Talisman) to ensure cryptographic identity and the ability to sign transactions.

Ricardian Contract Generator (The Legal Engine):

Takes input parameters from the Client (e.g., deliverables, deadlines, payment amount in PAS).

Injects these parameters into a standard Philippine Freelance Service Agreement.

Generates a human-readable document linked to a unique cryptographic hash.

Smart Contract Factory (The Infrastructure Engine):

A master Solidity contract that automatically clones and deploys a unique, lightweight escrow vault for every new agreement, saving gas and ensuring isolation for each deal.

Multi-Sig Escrow Vault (The Payment Engine):

A 2-of-3 multi-signature smart contract holding the PAS tokens.

Requires two approvals (Client + Freelancer, Client + Arbiter, or Freelancer + Arbiter) to release or refund funds.

Immutable Ledger (The Transparency Engine):

A frontend dashboard that queries the blockchain to display a verifiable, tamper-proof history of contract deployments, funding status, and payment releases.

4. User Journey Map
Onboarding: Client, Freelancer, and Arbiter connect their Web3 wallets to the AgarthaTech platform.

Deal Initiation: The Client fills out a project request form detailing the freelance job, the deadline, and the PAS token bounty.

Legal Review & Generation: The Arbiter reviews the terms on their dashboard and triggers the Ricardian Contract Generator to create the binding service agreement.

Sign & Fund: The Client and Freelancer sign the Ricardian contract via their wallets. This triggers the Factory to deploy a Multi-Sig Escrow on Paseo, automatically pulling the PAS tokens from the Client's wallet into the vault.

Execution & Resolution:

Happy Path: The Freelancer delivers the work; the Client and Freelancer both sign to release the PAS tokens to the Freelancer.

Dispute Path: The parties disagree on the deliverables. The Arbiter reviews the Ricardian contract and casts the deciding second vote to either pay the Freelancer or refund the Client.

5. Tech Stack Summary
Frontend: Next.js

Web3 Integration: Wagmi, viem, or ethers.js

Smart Contracts: Solidity

Blockchain: Polkadot Paseo Testnet

Currency: PAS (Testnet Token)