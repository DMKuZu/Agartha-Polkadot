'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';
import { RicardianGenerator } from '../../components/RicardianGenerator';

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };

export default function ClientPage() {
  const { address, isConnected } = useAccount();

  // ── Write hook (fund + approveRelease) ────────────────────────────────────────

  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
    error: escrowError,
    data: escrowTxHash,
  } = useWriteContract();

  const { isSuccess: isEscrowTxConfirmed } = useWaitForTransactionReceipt({ hash: escrowTxHash });

  // ── Deal state ────────────────────────────────────────────────────────────────

  const [documentHash, setDocumentHash] = useState<string>('');
  const [dealFormData, setDealFormData] = useState<any>(null);
  const [dealSubmitted, setDealSubmitted] = useState(false);
  const [dealId, setDealId] = useState<string>('');

  // ── Escrow address (set by Arbiter after deploy, read from localStorage) ──────

  const [escrowAddress, setEscrowAddress] = useState<string>('');
  const [escrowInputAddress, setEscrowInputAddress] = useState<string>('');

  // ── Toast system ──────────────────────────────────────────────────────────────

  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = (message: string, type: ToastEntry['type'] = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Check localStorage for arbiter-deployed escrow map ───────────────────────

  useEffect(() => {
    if (!address) return;
    const map = JSON.parse(localStorage.getItem('agartha_escrow_map') || '{}');
    const found = map[address.toLowerCase()];
    if (found) setEscrowAddress(found);
  }, [address]);

  // ── Read escrow state ─────────────────────────────────────────────────────────

  const activeEscrow = (escrowAddress || escrowInputAddress) as `0x${string}` | '';
  const escrowEnabled = !!activeEscrow && isAddress(activeEscrow);

  const { data: isFundedRaw, refetch: refetchFunded } = useReadContract({
    address: escrowEnabled ? (activeEscrow as `0x${string}`) : undefined,
    abi: ESCROW_ABI,
    functionName: 'isFunded',
    query: { enabled: escrowEnabled },
  });
  const isFunded = isFundedRaw as boolean | undefined;

  const { data: isReleasedRaw, refetch: refetchReleased } = useReadContract({
    address: escrowEnabled ? (activeEscrow as `0x${string}`) : undefined,
    abi: ESCROW_ABI,
    functionName: 'isReleased',
    query: { enabled: escrowEnabled },
  });
  const isReleased = isReleasedRaw as boolean | undefined;

  const { data: approvalCountRaw, refetch: refetchApprovals } = useReadContract({
    address: escrowEnabled ? (activeEscrow as `0x${string}`) : undefined,
    abi: ESCROW_ABI,
    functionName: 'approvalCount',
    query: { enabled: escrowEnabled },
  });
  const approvalCount = approvalCountRaw as bigint | undefined;

  const { data: hasApprovedRaw, refetch: refetchApproved } = useReadContract({
    address: escrowEnabled ? (activeEscrow as `0x${string}`) : undefined,
    abi: ESCROW_ABI,
    functionName: 'hasApproved',
    args: address ? [address] : undefined,
    query: { enabled: escrowEnabled && !!address },
  });
  const hasApproved = hasApprovedRaw as boolean | undefined;

  // ── Refetch after tx ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchFunded(); refetchReleased(); refetchApprovals(); refetchApproved();
    showToast('Transaction confirmed');
  }, [isEscrowTxConfirmed]);

  useEffect(() => {
    if (isEscrowError) showToast('Transaction failed', 'error');
  }, [isEscrowError]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleAgreementGenerated = (data: { documentHash: string; formData: any }) => {
    setDocumentHash(data.documentHash);
    setDealFormData(data.formData);
  };

  const handleSubmitDeal = () => {
    if (!documentHash || !dealFormData || !address) return;
    const id = Date.now().toString(36);
    const deal = {
      id,
      clientAddress: address,
      freelancerAddress: dealFormData.freelancerAddress,
      amount: dealFormData.amount,
      title: dealFormData.title,
      deliverables: dealFormData.deliverables,
      deadline: dealFormData.deadline,
      documentHash,
    };
    const existing = JSON.parse(localStorage.getItem('agartha_pending_deals') || '[]');
    localStorage.setItem('agartha_pending_deals', JSON.stringify([...existing, deal]));
    setDealId(id);
    setDealSubmitted(true);
    showToast('Deal submitted for Arbiter review');
  };

  const handleFund = () => {
    const addr = (escrowAddress || escrowInputAddress) as `0x${string}`;
    if (!addr || !dealFormData?.amount) return;
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'fund', value: parseEther(dealFormData.amount) });
  };

  const handleApprove = () => {
    const addr = (escrowAddress || escrowInputAddress) as `0x${string}`;
    if (!addr) return;
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <RoleGuard requiredRole="client">
      <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
        <div className="bg-white p-10 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-3 text-slate-800">Client Portal</h1>
            <p className="text-slate-500 mb-4">Create your freelance agreement and manage your escrow.</p>
            <div className="flex justify-center mb-4"><ConnectButton /></div>
            <div className="flex justify-center gap-3 mb-4">
              <Link href="/dashboard" className="inline-block text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-md transition-colors">
                View All Cases →
              </Link>
              <Link href="/" className="inline-block text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md transition-colors">
                ← Switch Role
              </Link>
            </div>
          </div>

          <hr className="border-slate-200 mb-8" />

          {!isConnected && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800 mb-6">
              Connect your wallet to continue.
            </div>
          )}

          {/* Step 1: Generate Agreement */}
          {isConnected && (
            <RicardianGenerator onGenerated={handleAgreementGenerated} />
          )}

          {/* Step 2: Submit for Arbiter Review */}
          {isConnected && documentHash && !dealSubmitted && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">2. Submit for Arbiter Review</h2>
              <p className="text-sm text-slate-500 mb-4">
                Your agreement has been hashed. Submit it for the Arbiter to review and deploy the escrow contract.
              </p>
              <button
                onClick={handleSubmitDeal}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md transition-colors"
              >
                Submit for Arbiter Review
              </button>
            </div>
          )}

          {/* Submitted confirmation */}
          {dealSubmitted && (
            <div className="mt-8 p-5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="font-semibold text-indigo-800">Deal submitted for review.</p>
              <p className="text-sm text-indigo-600 mt-1">
                Reference ID: <span className="font-mono font-bold">{dealId}</span>
              </p>
              <p className="text-xs text-indigo-500 mt-2">
                Share this ID with your Arbiter. Once they deploy the escrow contract, the address will appear below automatically.
              </p>
            </div>
          )}

          {/* Step 3: Fund Escrow */}
          {isConnected && dealSubmitted && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">3. Fund Escrow</h2>

              {escrowAddress ? (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-xs">
                  <p className="text-green-700 font-semibold mb-1">Escrow contract ready:</p>
                  <p className="font-mono text-green-800 break-all">{escrowAddress}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-3">
                    Waiting for Arbiter to deploy the escrow. When they do, the address will auto-load — or paste it manually:
                  </p>
                  <input
                    type="text"
                    placeholder="Escrow contract address (0x...)"
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm mb-3"
                    value={escrowInputAddress}
                    onChange={(e) => setEscrowInputAddress(e.target.value.trim())}
                  />
                </>
              )}

              {escrowEnabled && !isFunded && !isReleased && (
                <>
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                    Amount to deposit: <strong>{dealFormData?.amount} PAS</strong>
                  </div>
                  <button
                    onClick={handleFund}
                    disabled={isEscrowPending}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
                  >
                    {isEscrowPending ? 'Confirming in Wallet...' : `Deposit ${dealFormData?.amount} PAS`}
                  </button>
                </>
              )}

              {isFunded && !isReleased && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700 font-medium">
                  Escrow funded. Waiting for approvals.
                </div>
              )}

              {isEscrowError && (
                <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs font-mono break-all">
                  {escrowError?.message}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Approve Release */}
          {escrowEnabled && isFunded && !isReleased && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">4. Approve Release</h2>
              <p className="text-sm text-slate-500 mb-4">
                Approve to release funds to the Freelancer. Funds release at 2 of 3 approvals.
              </p>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm font-medium text-slate-600">Approvals:</span>
                <span className="text-2xl font-bold text-slate-800">{String(approvalCount ?? 0)}</span>
                <span className="text-slate-400 text-lg">/</span>
                <span className="text-2xl font-bold text-slate-400">3</span>
                <div className="flex gap-2 ml-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`w-5 h-5 rounded-full border-2 ${
                      i < Number(approvalCount ?? 0) ? 'bg-green-500 border-green-600' : 'bg-slate-200 border-slate-300'
                    }`} />
                  ))}
                </div>
              </div>
              {hasApproved ? (
                <div className="p-3 bg-green-50 text-green-800 rounded-md border border-green-200 text-sm font-medium">
                  This wallet has already approved.
                </div>
              ) : (
                <button
                  onClick={handleApprove}
                  disabled={isEscrowPending}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
                >
                  {isEscrowPending ? 'Confirming in Wallet...' : 'Approve Release'}
                </button>
              )}
            </div>
          )}

          {/* Settlement Complete */}
          {escrowEnabled && isReleased && (
            <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-300 text-center">
              <h2 className="text-2xl font-bold text-green-800 mb-2">Payment Released</h2>
              <p className="text-sm text-green-700">Funds have been released to the Freelancer.</p>
              <p className="text-xs font-mono text-green-600 mt-3 break-all">Escrow: {activeEscrow}</p>
            </div>
          )}

        </div>

        {/* Toast notifications */}
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {t.message}
            </div>
          ))}
        </div>
      </main>
    </RoleGuard>
  );
}
