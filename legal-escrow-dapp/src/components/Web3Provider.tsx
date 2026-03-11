'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { http } from 'wagmi';
import { sepolia, hardhat } from 'wagmi/chains';
import { defineChain } from 'viem';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

// Polkadot EVM Testnet
const paseoEvm = defineChain({
  id: 420420417,
  name: 'Polkadot EVM Testnet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io/'] },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://blockscout-testnet.polkadot.io',
    },
  },
  testnet: true,
});

const config = getDefaultConfig({
  appName: 'AgarthaTech Legal Escrow',
  projectId: 'f963666ec968efcfbbae97622213c69c',
  chains: [paseoEvm, hardhat, sepolia],
  transports: {
    [paseoEvm.id]: http('https://eth-rpc-testnet.polkadot.io/'),
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
