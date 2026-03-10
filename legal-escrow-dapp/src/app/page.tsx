'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RicardianUploader } from '../components/RicardianUploader';
import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseEther, isAddress } from 'viem';

import { FACTORY_ADDRESS, FACTORY_ABI } from '../contracts/abis';

export default function Home() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, isSuccess, isError, error, data: hash } = useWriteContract();

  const [documentHash, setDocumentHash] = useState<string>('');
  const [buyerAddress, setBuyerAddress] = useState<string>('');
  const [sellerAddress, setSellerAddress] = useState<string>('');
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  const handleHashGenerated = (hash: string) => {
    setDocumentHash(hash);
  };

  const handleDeployContract = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!documentHash) return setValidationError('Please upload and hash a document first.');
    if (!buyerAddress || !sellerAddress || !settlementAmount) return setValidationError('Please fill in all fields.');
    if (!isAddress(buyerAddress)) return setValidationError('Buyer address is not a valid Ethereum address.');
    if (!isAddress(sellerAddress)) return setValidationError('Seller address is not a valid Ethereum address.');
    if (buyerAddress.toLowerCase() === sellerAddress.toLowerCase()) return setValidationError('Buyer and seller cannot be the same address.');
    if (parseFloat(settlementAmount) <= 0) return setValidationError('Settlement amount must be greater than 0.');

    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'createCase',
      args: [
        buyerAddress as `0x${string}`,
        sellerAddress as `0x${string}`,
        address as `0x${string}`,
        parseEther(settlementAmount),
        documentHash,
      ],
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

        <RicardianUploader onHashGenerated={handleHashGenerated} />

        {isConnected && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">2. Deploy Settlement Contract</h2>
            <p className="text-sm text-slate-500 mb-4">
              Your connected wallet <span className="font-mono font-semibold text-slate-700">{address}</span> will be recorded as the <strong>lawyer</strong>.
            </p>

            <form onSubmit={handleDeployContract} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Wallet Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value.trim())}
                />
                {buyerAddress && !isAddress(buyerAddress) && (
                  <p className="text-xs text-red-500 mt-1">Invalid address format.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Seller Wallet Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                  value={sellerAddress}
                  onChange={(e) => setSellerAddress(e.target.value.trim())}
                />
                {sellerAddress && !isAddress(sellerAddress) && (
                  <p className="text-xs text-red-500 mt-1">Invalid address format.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Settlement Amount (ETH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 1.5"
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                />
              </div>

              {validationError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">
                  {validationError}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || !documentHash}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
              >
                {isPending ? 'Confirming in Wallet...' : 'Deploy Smart Contract'}
              </button>

              {isSuccess && (
                <div className="mt-2 p-4 bg-green-100 text-green-800 rounded-md border border-green-300">
                  <p className="font-semibold">Contract deployed successfully.</p>
                  <p className="text-xs break-all mt-1 font-mono">Transaction Hash: {hash}</p>
                </div>
              )}

              {isError && (
                <div className="mt-2 p-4 bg-red-100 text-red-800 rounded-md border border-red-300">
                  <p className="font-semibold">Transaction failed.</p>
                  <p className="text-xs break-all mt-1 font-mono">{error?.message}</p>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
