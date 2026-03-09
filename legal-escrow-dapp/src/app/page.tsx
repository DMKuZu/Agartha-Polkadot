'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RicardianUploader } from '../components/RicardianUploader';
import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';

// Ensure your abis.ts file has the correct address and ABI exported
import { FACTORY_ADDRESS, FACTORY_ABI } from '../contracts/abis';

export default function Home() {
  const { address, isConnected } = useAccount(); // Gets the connected lawyer's wallet address
  const { writeContract, isPending, isSuccess, data: hash } = useWriteContract();

  // Form State
  const [documentHash, setDocumentHash] = useState<string>('');
  const [buyerAddress, setBuyerAddress] = useState<string>('');
  const [sellerAddress, setSellerAddress] = useState<string>('');
  const [settlementAmount, setSettlementAmount] = useState<string>('');

  const handleHashGenerated = (hash: string) => {
    setDocumentHash(hash);
  };

  const handleDeployContract = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!documentHash) return alert("Please upload and hash a document first!");
    if (!buyerAddress ||!sellerAddress ||!settlementAmount) return alert("Please fill in all fields!");

    // This triggers MetaMask to execute the transaction on the blockchain
    writeContract({
      address: FACTORY_ADDRESS as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'createCase',
      args: [buyerAddress, sellerAddress, address,  parseEther(settlementAmount), documentHash],
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
      <div className="bg-white p-10 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-3 text-slate-800">Legal Escrow Dashboard</h1>
          <p className="text-slate-500 mb-8">Secure, automated, and CPRA-compliant settlement architecture.</p>
          <div className="flex justify-center mb-8">
            <ConnectButton />
          </div>
        </div>

        <hr className="border-slate-200 mb-8" />

        {/* Step 1: The Ricardian Engine */}
        <RicardianUploader onHashGenerated={handleHashGenerated} />

        {/* Step 2: Contract Deployment Form (Only shows if a wallet is connected) */}
        {isConnected && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-4 text-slate-700">2. Deploy Settlement Contract</h2>
            
            <form onSubmit={handleDeployContract} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Wallet Address</label>
                <input 
                  type="text" 
                  placeholder="0x..." 
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Seller Wallet Address</label>
                <input 
                  type="text" 
                  placeholder="0x..." 
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  value={sellerAddress}
                  onChange={(e) => setSellerAddress(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Settlement Amount (Test ETH)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="e.g. 1.5" 
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                disabled={isPending ||!documentHash}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
              >
                {isPending? 'Confirming in Wallet...' : 'Deploy Smart Contract'}
              </button>

              {isSuccess && (
                <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-md border border-green-300">
                  <p className="font-semibold">Success! Contract Deployed.</p>
                  <p className="text-xs break-all mt-1">Transaction Hash: {hash}</p>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}