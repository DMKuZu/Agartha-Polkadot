'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };

export default function FreelancerPage() {
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

  // ── Read all deployed escrows ─────────────────────────────────────────────────

  const {
    data: escrowsRaw,
    isLoading,
    refetch,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getDeployedEscrows',
  });

  const allEscrows = (escrowsRaw ?? []) as `0x${string}`[];

  // ── Batch read: seller + isFunded + isReleased + approvalCount + hasApproved ──

  const contractReads = allEscrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'seller' },
    { address: addr, abi: ESCROW_ABI, functionName: 'buyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'lawyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'settlementAmount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'approvalCount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'hasApproved', args: address ? [address] : undefined },
  ]);

  const { data: stateData, refetch: refetchState } = useReadContracts({
    contracts: contractReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  // ── Filter to escrows where seller == connected wallet ────────────────────────

  const myContracts = allEscrows
    .map((addr, i) => {
      const base = i * 8;
      return {
        address: addr,
        seller:           stateData?.[base + 0]?.result as `0x${string}` | undefined,
        buyer:            stateData?.[base + 1]?.result as `0x${string}` | undefined,
        lawyer:           stateData?.[base + 2]?.result as `0x${string}` | undefined,
        settlementAmount: stateData?.[base + 3]?.result as bigint | undefined,
        isFunded:         stateData?.[base + 4]?.result as boolean | undefined,
        isReleased:       stateData?.[base + 5]?.result as boolean | undefined,
        approvalCount:    stateData?.[base + 6]?.result as bigint | undefined,
        hasApproved:      stateData?.[base + 7]?.result as boolean | undefined,
      };
    })
    .filter((c) => c.seller?.toLowerCase() === address?.toLowerCase());

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const [pendingApproval, setPendingApproval] = useState<string | null>(null);

  const handleApprove = (escrowAddr: `0x${string}`) => {
    setPendingApproval(escrowAddr);
    writeEscrow({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchState();
    setPendingApproval(null);
    showToast('Approval confirmed');
  }, [isEscrowTxConfirmed]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <RoleGuard requiredRole="freelancer">
      <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Freelancer Portal</h1>
              <p className="text-sm text-slate-500 mt-1">View your active contracts and approve payment release.</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md transition-colors">
                ← Switch Role
              </Link>
              <ConnectButton />
            </div>
          </div>

          <hr className="border-slate-200 mb-6" />

          {/* Not connected */}
          {!isConnected && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              Connect your wallet to view your contracts.
            </div>
          )}

          {/* Loading */}
          {isConnected && isLoading && (
            <p className="text-sm text-slate-500 py-4">Loading contracts...</p>
          )}

          {/* No contracts */}
          {isConnected && !isLoading && myContracts.length === 0 && (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-md text-center">
              <p className="text-sm text-slate-600">No contracts assigned to your wallet yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Connected as: <span className="font-mono">{address}</span>
              </p>
            </div>
          )}

          {/* Contract list */}
          {isConnected && myContracts.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-slate-600">
                  {myContracts.length} contract{myContracts.length !== 1 ? 's' : ''} found
                </span>
                <button
                  onClick={() => { refetch(); refetchState(); }}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-4">
                {myContracts.map((c) => (
                  <div key={c.address} className="border border-slate-200 rounded-lg p-5 bg-slate-50">
                    {/* Contract header */}
                    <div className="flex items-start justify-between mb-4 gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-slate-600 break-all">{c.address}</p>
                      </div>
                      <div className="flex-shrink-0">
                        {c.isReleased ? (
                          <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">
                            Payment Received
                          </span>
                        ) : c.isFunded ? (
                          <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">
                            Funded — {String(c.approvalCount ?? 0)}/3 approvals
                          </span>
                        ) : (
                          <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                            Awaiting Funding
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contract details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Client</p>
                        <p className="font-mono text-slate-700 break-all text-xs">{c.buyer ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Arbiter</p>
                        <p className="font-mono text-slate-700 break-all text-xs">{c.lawyer ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Settlement Amount</p>
                        <p className="font-semibold text-slate-800">
                          {c.settlementAmount !== undefined
                            ? `${formatEther(c.settlementAmount)} PAS`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Settlement received banner */}
                    {c.isReleased && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700 font-medium text-center">
                        Payment has been released to your wallet.
                      </div>
                    )}

                    {/* Approve action */}
                    {c.isFunded && !c.isReleased && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs text-slate-500">Approvals:</span>
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map((i) => (
                              <div key={i} className={`w-4 h-4 rounded-full border-2 ${
                                i < Number(c.approvalCount ?? 0)
                                  ? 'bg-green-500 border-green-600'
                                  : 'bg-slate-200 border-slate-300'
                              }`} />
                            ))}
                          </div>
                          <span className="text-xs text-slate-500">{String(c.approvalCount ?? 0)} / 3</span>
                        </div>

                        {c.hasApproved ? (
                          <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium text-center">
                            You have approved. Waiting for other parties.
                          </div>
                        ) : (
                          <button
                            onClick={() => handleApprove(c.address)}
                            disabled={isEscrowPending && pendingApproval === c.address}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-md text-sm transition-colors disabled:bg-slate-400"
                          >
                            {isEscrowPending && pendingApproval === c.address
                              ? 'Confirming...'
                              : 'Approve Release'}
                          </button>
                        )}
                      </div>
                    )}

                    {isEscrowError && pendingApproval === c.address && (
                      <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-xs font-mono break-all">
                        {escrowError?.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
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
