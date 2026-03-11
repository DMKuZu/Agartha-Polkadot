'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { parseEther, formatEther, isAddress } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';
import { RicardianGenerator } from '../../components/RicardianGenerator';

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };

interface MyDealItem {
  address: `0x${string}`;
  buyer:            `0x${string}` | undefined;
  seller:           `0x${string}` | undefined;
  settlementAmount: bigint | undefined;
  isFunded:         boolean | undefined;
  isReleased:       boolean | undefined;
  approvalCount:    bigint | undefined;
  hasApproved:      boolean | undefined;
}

export default function ClientPage() {
  const { address, isConnected } = useAccount();

  // ── Write hook ────────────────────────────────────────────────────────────────

  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
    error: escrowError,
    data: escrowTxHash,
  } = useWriteContract();

  const { isSuccess: isEscrowTxConfirmed } = useWaitForTransactionReceipt({ hash: escrowTxHash });

  // ── Toast system ──────────────────────────────────────────────────────────────

  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = (message: string, type: ToastEntry['type'] = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  useEffect(() => { if (isEscrowError) showToast('Transaction failed', 'error'); }, [isEscrowError]);

  // ── On-chain deals: all escrows where buyer == address ────────────────────────

  const {
    data: allEscrowsRaw,
    isLoading: isLoadingEscrows,
    refetch: refetchEscrows,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getDeployedEscrows',
    query: { enabled: !!address },
  });

  const allEscrows = (allEscrowsRaw ?? []) as `0x${string}`[];

  const dealReads = allEscrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'buyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'seller' },
    { address: addr, abi: ESCROW_ABI, functionName: 'settlementAmount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'approvalCount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'hasApproved', args: address ? [address] : undefined },
  ]);

  const { data: dealStateData, refetch: refetchDealState } = useReadContracts({
    contracts: dealReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  const myDeals: MyDealItem[] = allEscrows
    .map((addr, i) => {
      const base = i * 7;
      return {
        address: addr,
        buyer:            dealStateData?.[base + 0]?.result as `0x${string}` | undefined,
        seller:           dealStateData?.[base + 1]?.result as `0x${string}` | undefined,
        settlementAmount: dealStateData?.[base + 2]?.result as bigint | undefined,
        isFunded:         dealStateData?.[base + 3]?.result as boolean | undefined,
        isReleased:       dealStateData?.[base + 4]?.result as boolean | undefined,
        approvalCount:    dealStateData?.[base + 5]?.result as bigint | undefined,
        hasApproved:      dealStateData?.[base + 6]?.result as boolean | undefined,
      };
    })
    .filter((d) => d.buyer?.toLowerCase() === address?.toLowerCase());

  // ── Refetch after tx ──────────────────────────────────────────────────────────

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchEscrows();
    refetchDealState();
    setPendingAction(null);
    showToast('Transaction confirmed');
  }, [isEscrowTxConfirmed]);

  // ── Per-deal fund / approve ───────────────────────────────────────────────────

  const handleFund = (addr: `0x${string}`, amount: bigint) => {
    setPendingAction(addr);
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'fund', value: amount });
  };

  const handleApprove = (addr: `0x${string}`) => {
    setPendingAction(addr);
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  // ── New deal form state ───────────────────────────────────────────────────────

  const [showNewDeal, setShowNewDeal] = useState(false);
  const [documentHash, setDocumentHash] = useState<string>('');
  const [dealFormData, setDealFormData] = useState<any>(null);
  const [dealSubmitted, setDealSubmitted] = useState(false);
  const [dealId, setDealId] = useState<string>('');

  const handleAgreementGenerated = (data: { documentHash: string; formData: any }) => {
    setDocumentHash(data.documentHash);
    setDealFormData(data.formData);
  };

  const handleSubmitDeal = () => {
    if (!documentHash || !dealFormData || !address) return;
    if (!isAddress(dealFormData.freelancerAddress)) return showToast('Invalid freelancer address', 'error');
    const id = Date.now().toString(36);
    const deal = {
      id,
      clientAddress:     address,
      freelancerAddress: dealFormData.freelancerAddress,
      amount:            dealFormData.amount,
      title:             dealFormData.title,
      deliverables:      dealFormData.deliverables,
      deadline:          dealFormData.deadline,
      documentHash,
    };
    const existing = JSON.parse(localStorage.getItem('agartha_pending_deals') || '[]');
    localStorage.setItem('agartha_pending_deals', JSON.stringify([...existing, deal]));
    setDealId(id);
    setDealSubmitted(true);
    showToast('Deal submitted for Arbiter review');
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <RoleGuard requiredRole="client">
      <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
        <div className="bg-white p-10 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-3 text-slate-800">Client Portal</h1>
            <p className="text-slate-500 mb-4">Manage your agreements and escrow payments.</p>
            <div className="flex justify-center mb-4"><ConnectButton /></div>
            <div className="flex justify-center mb-4">
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

          {/* My Deals — on-chain history */}
          {isConnected && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-700">My Deals</h2>
                <button
                  onClick={() => { refetchEscrows(); refetchDealState(); }}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>

              {isLoadingEscrows ? (
                <p className="text-sm text-slate-500">Loading your deals...</p>
              ) : myDeals.length === 0 ? (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <p className="text-sm text-slate-600">No escrow contracts found for your wallet.</p>
                  <p className="text-xs text-slate-400 mt-1">Submit a deal for Arbiter review below to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myDeals.map((d) => (
                    <div key={d.address} className="border border-slate-200 rounded-lg p-5 bg-slate-50">

                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-slate-600 break-all">{d.address}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Freelancer: <span className="font-mono">{d.seller?.slice(0, 10)}…</span>
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {d.isReleased ? (
                            <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">Released</span>
                          ) : d.isFunded ? (
                            <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">
                              Funded — {String(d.approvalCount ?? 0)}/3 approvals
                            </span>
                          ) : (
                            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">Awaiting Funding</span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      {d.settlementAmount !== undefined && (
                        <p className="text-sm font-semibold text-slate-800 mb-3">
                          {formatEther(d.settlementAmount)} PAS
                        </p>
                      )}

                      {/* Fund action */}
                      {!d.isFunded && !d.isReleased && d.settlementAmount !== undefined && (
                        <button
                          onClick={() => handleFund(d.address, d.settlementAmount!)}
                          disabled={isEscrowPending && pendingAction === d.address}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-md text-sm transition-colors disabled:bg-slate-400"
                        >
                          {isEscrowPending && pendingAction === d.address
                            ? 'Confirming...'
                            : `Deposit ${formatEther(d.settlementAmount)} PAS`}
                        </button>
                      )}

                      {/* Approve action */}
                      {d.isFunded && !d.isReleased && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-slate-500">Approvals:</span>
                            <div className="flex gap-1.5">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className={`w-4 h-4 rounded-full border-2 ${
                                  i < Number(d.approvalCount ?? 0)
                                    ? 'bg-green-500 border-green-600'
                                    : 'bg-slate-200 border-slate-300'
                                }`} />
                              ))}
                            </div>
                            <span className="text-xs text-slate-500">{String(d.approvalCount ?? 0)} / 3</span>
                          </div>
                          {d.hasApproved ? (
                            <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium text-center">
                              You have approved. Waiting for other parties.
                            </div>
                          ) : (
                            <button
                              onClick={() => handleApprove(d.address)}
                              disabled={isEscrowPending && pendingAction === d.address}
                              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-md text-sm transition-colors disabled:bg-slate-400"
                            >
                              {isEscrowPending && pendingAction === d.address
                                ? 'Confirming...'
                                : 'Approve Release'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Released */}
                      {d.isReleased && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 font-medium text-center">
                          Payment released to Freelancer.
                        </div>
                      )}

                      {isEscrowError && pendingAction === d.address && (
                        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-xs font-mono break-all">
                          {escrowError?.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <hr className="border-slate-200 mb-6" />

          {/* New Deal — create + submit for arbiter review */}
          {isConnected && (
            <div>
              <button
                onClick={() => setShowNewDeal(!showNewDeal)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              >
                <span className="text-sm font-semibold text-indigo-800">+ Create New Deal</span>
                <span className="text-xs text-indigo-500">{showNewDeal ? 'Collapse ▲' : 'Expand ▼'}</span>
              </button>

              {showNewDeal && (
                <div className="mt-4">
                  {/* Step 1: Generate Agreement */}
                  <RicardianGenerator onGenerated={handleAgreementGenerated} />

                  {/* Step 2: Submit for Arbiter Review */}
                  {documentHash && !dealSubmitted && (
                    <div className="mt-6 p-6 bg-slate-50 rounded-lg border border-slate-200">
                      <h2 className="text-lg font-semibold mb-1 text-slate-700">Submit for Arbiter Review</h2>
                      <p className="text-sm text-slate-500 mb-4">
                        Your agreement is hashed and ready. Submit it for the Arbiter to review and deploy the escrow contract.
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
                    <div className="mt-6 p-5 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <p className="font-semibold text-indigo-800">Deal submitted for review.</p>
                      <p className="text-sm text-indigo-600 mt-1">
                        Reference ID: <span className="font-mono font-bold">{dealId}</span>
                      </p>
                      <p className="text-xs text-indigo-500 mt-2">
                        Once the Arbiter deploys the escrow contract, it will appear in your deals above.
                      </p>
                      <button
                        onClick={() => { setDealSubmitted(false); setDocumentHash(''); setDealFormData(null); }}
                        className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Submit another deal
                      </button>
                    </div>
                  )}
                </div>
              )}
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
