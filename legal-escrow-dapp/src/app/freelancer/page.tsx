'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };

// ── View document button ───────────────────────────────────────────────────────

function ViewDocumentButton({ dealId, walletAddress }: { dealId: string; walletAddress: string }) {
  const [fetching, setFetching] = useState(false);

  const handleClick = async () => {
    setFetching(true);
    try {
      const r = await fetch(`/api/deals/${dealId}/document?wallet_address=${walletAddress}`);
      const data = await r.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        alert(data.error ?? 'Could not retrieve document.');
      }
    } catch {
      alert('Could not retrieve document.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={fetching}
      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors disabled:text-slate-400"
    >
      {fetching ? 'Loading…' : 'View / Download Document'}
    </button>
  );
}

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

  // ── Batch read: seller + isFunded + isReleased + approvalCount + hasApproved + documentHash + cancel state ──

  const contractReads = allEscrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'seller' },
    { address: addr, abi: ESCROW_ABI, functionName: 'buyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'lawyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'settlementAmount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'approvalCount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'hasApproved', args: address ? [address] : undefined },
    { address: addr, abi: ESCROW_ABI, functionName: 'documentHash' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isCancelled' },
    { address: addr, abi: ESCROW_ABI, functionName: 'cancelApprovalCount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'hasCancelApproved', args: address ? [address] : undefined },
  ]);

  const { data: stateData, refetch: refetchState } = useReadContracts({
    contracts: contractReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  // ── Filter to escrows where seller == connected wallet ────────────────────────

  const myContracts = allEscrows
    .map((addr, i) => {
      const base = i * 12;
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
        documentHash:     stateData?.[base + 8]?.result as string | undefined,
        isCancelled:         stateData?.[base + 9]?.result  as boolean | undefined,
        cancelApprovalCount: stateData?.[base + 10]?.result as bigint  | undefined,
        hasCancelApproved:   stateData?.[base + 11]?.result as boolean | undefined,
      };
    })
    .filter((c) => c.seller?.toLowerCase() === address?.toLowerCase());

  // ── Agreement viewing — fetched silently from DB by document hash ─────────────

  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());
  const [contractDealInfo, setContractDealInfo] = useState<Record<string, { formData: any; dealId: string }>>({});

  useEffect(() => {
    const hashes = myContracts.map(c => c.documentHash).filter(Boolean) as string[];
    hashes.forEach(hash => {
      if (contractDealInfo[hash]) return;
      fetch(`/api/deals/by-hash/${hash}`)
        .then(r => r.json())
        .then(({ deal }) => {
          if (deal?.form_data) {
            setContractDealInfo(prev => ({ ...prev, [hash]: { formData: deal.form_data, dealId: deal.id } }));
          }
        })
        .catch(() => {});
    });
  }, [myContracts.length]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const [pendingApproval, setPendingApproval] = useState<string | null>(null);

  const handleApprove = (escrowAddr: `0x${string}`) => {
    setPendingApproval(escrowAddr);
    writeEscrow({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  const handleApproveCancellation = (escrowAddr: `0x${string}`) => {
    setPendingApproval(escrowAddr + '-cancel');
    writeEscrow({ address: escrowAddr, abi: ESCROW_ABI, functionName: 'approveCancellation' });
  };

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchState();
    setPendingApproval(null);
    showToast('Approval confirmed');
  }, [isEscrowTxConfirmed]);

  // ── Pending Acceptance — deals awaiting freelancer acceptance ────────────────

  interface PendingAcceptanceDeal {
    dbId: string;
    clientAddress: string;
    amount: string;
    filename: string;
    deadline: string;
    formData: any;
    freelancerAccepted: boolean;
  }

  const [pendingAcceptanceDeals, setPendingAcceptanceDeals] = useState<PendingAcceptanceDeal[]>([]);
  const [expandedPendingDeal, setExpandedPendingDeal] = useState<string | null>(null);
  const [acceptingDealId, setAcceptingDealId] = useState<string | null>(null);
  const [rejectingDealId, setRejectingDealId] = useState<string | null>(null);

  const fetchPendingAcceptanceDeals = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`/api/deals?wallet_address=${address}`);
      const { deals } = await r.json();
      if (!Array.isArray(deals)) return;
      const items: PendingAcceptanceDeal[] = deals
        .filter((d: any) => d.status === 'pending_acceptance')
        .map((d: any) => ({
          dbId:               d.id,
          clientAddress:      d.client_address,
          amount:             d.form_data?.amount ?? '',
          filename:           d.form_data?.filename ?? d.form_data?.title ?? '(document)',
          deadline:           d.form_data?.deadline ?? '',
          formData:           d.form_data,
          freelancerAccepted: d.freelancer_accepted ?? false,
        }));
      setPendingAcceptanceDeals(items);
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) fetchPendingAcceptanceDeals();
  }, [isConnected, address, fetchPendingAcceptanceDeals]);

  const handleAcceptDeal = async (dbId: string) => {
    if (!address) return;
    setAcceptingDealId(dbId);
    try {
      const r = await fetch(`/api/deals/${dbId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Could not accept deal', 'error'); return; }
      showToast('Deal accepted');
      fetchPendingAcceptanceDeals();
    } catch {
      showToast('Could not accept deal', 'error');
    } finally {
      setAcceptingDealId(null);
    }
  };

  const handleRejectDeal = async (dbId: string) => {
    if (!address) return;
    setRejectingDealId(dbId);
    try {
      const r = await fetch(`/api/deals/${dbId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Could not reject deal', 'error'); return; }
      showToast('Deal rejected');
      fetchPendingAcceptanceDeals();
    } catch {
      showToast('Could not reject deal', 'error');
    } finally {
      setRejectingDealId(null);
    }
  };

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
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors mt-1 inline-block">
                View Global Case Ledger →
              </Link>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
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

          {/* Pending Acceptance Queue */}
          {isConnected && (
            <div className="mb-8 p-6 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-amber-800">Pending Acceptance</h2>
                <button
                  onClick={fetchPendingAcceptanceDeals}
                  className="text-xs text-amber-600 hover:text-amber-900 border border-amber-200 px-3 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>
              <p className="text-xs text-amber-700 mb-4">
                Deals created by Clients that require your acceptance before an escrow contract is deployed.
              </p>

              {pendingAcceptanceDeals.length === 0 ? (
                <p className="text-sm text-amber-600">No deals awaiting your acceptance.</p>
              ) : (
                <div className="space-y-3">
                  {pendingAcceptanceDeals.map((deal) => (
                    <div key={deal.dbId} className="bg-white rounded-md border border-amber-200 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{deal.filename}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {deal.amount} PAS · Client: <span className="font-mono">{deal.clientAddress?.slice(0, 10)}…</span>
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setExpandedPendingDeal(expandedPendingDeal === deal.dbId ? null : deal.dbId)}
                            className="text-xs text-amber-700 hover:text-amber-900 border border-amber-200 px-2 py-1 rounded transition-colors"
                          >
                            {expandedPendingDeal === deal.dbId ? 'Collapse' : 'Review'}
                          </button>
                          {!deal.freelancerAccepted && (
                            <>
                              <button
                                onClick={() => handleRejectDeal(deal.dbId)}
                                disabled={rejectingDealId === deal.dbId || acceptingDealId === deal.dbId}
                                className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {rejectingDealId === deal.dbId ? 'Rejecting…' : 'Reject'}
                              </button>
                              <button
                                onClick={() => handleAcceptDeal(deal.dbId)}
                                disabled={acceptingDealId === deal.dbId || rejectingDealId === deal.dbId}
                                className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:bg-slate-400"
                              >
                                {acceptingDealId === deal.dbId ? 'Accepting…' : 'Accept'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {deal.freelancerAccepted && (
                        <div className="mt-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium">
                          You have accepted. Waiting for Arbiter.
                        </div>
                      )}

                      {expandedPendingDeal === deal.dbId && (
                        <div className="mt-3 pt-3 border-t border-amber-100 space-y-2">
                          <div className="text-xs space-y-1.5">
                            <div><span className="text-slate-500">Client:</span> <span className="font-mono text-slate-700 break-all">{deal.clientAddress}</span></div>
                            <div><span className="text-slate-500">Amount:</span> <span className="font-semibold text-slate-700">{deal.amount} PAS</span></div>
                          </div>
                          {deal.formData?.type === 'file' && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-slate-600 mb-1">Agreement Document:</p>
                              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-2">
                                <p className="font-semibold text-slate-800">{deal.formData.filename}</p>
                                {address && <ViewDocumentButton dealId={deal.dbId} walletAddress={address} />}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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

                    {/* Agreement viewing */}
                    {c.documentHash && contractDealInfo[c.documentHash] && (() => {
                      const { formData, dealId } = contractDealInfo[c.documentHash];
                      const isExpanded = expandedAgreements.has(c.address);
                      return (
                        <div className="mt-3 mb-4 border-t border-slate-200 pt-3">
                          <button
                            onClick={() => setExpandedAgreements(prev => {
                              const next = new Set(prev);
                              isExpanded ? next.delete(c.address) : next.add(c.address);
                              return next;
                            })}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors"
                          >
                            {isExpanded ? 'Hide Document' : 'View Document'}
                          </button>
                          {isExpanded && (
                            <div className="mt-3">
                              {formData?.type === 'file' ? (
                                <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-2">
                                  <p className="font-semibold text-slate-800">{formData.filename}</p>
                                  <p className="text-slate-500">Document hash (on-chain proof):</p>
                                  <p className="font-mono text-slate-600 break-all">{c.documentHash}</p>
                                  {address && <ViewDocumentButton dealId={dealId} walletAddress={address} />}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">No preview available.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Settlement received banner */}
                    {c.isReleased && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700 font-medium text-center">
                        Payment has been released to your wallet.
                      </div>
                    )}

                    {/* Deal cancelled banner */}
                    {c.isCancelled && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 font-medium text-center">
                        Deal cancelled — funds have been refunded to the Client.
                      </div>
                    )}

                    {/* Approve action */}
                    {c.isFunded && !c.isReleased && !c.isCancelled && (
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

                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <p className="text-xs font-medium text-slate-500 mb-2">Cancel Deal (2-of-3 approval required)</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex gap-1.5">
                              {[0, 1].map((i) => (
                                <div key={i} className={`w-4 h-4 rounded-full border-2 ${
                                  i < Number(c.cancelApprovalCount ?? 0)
                                    ? 'bg-red-500 border-red-600'
                                    : 'bg-slate-200 border-slate-300'
                                }`} />
                              ))}
                            </div>
                            <span className="text-xs text-slate-500">{String(c.cancelApprovalCount ?? 0)} / 2 cancel approvals</span>
                          </div>
                          {c.hasCancelApproved ? (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium text-center">
                              You approved cancellation. Waiting for another party.
                            </div>
                          ) : (
                            <button
                              onClick={() => handleApproveCancellation(c.address)}
                              disabled={isEscrowPending && pendingApproval === c.address + '-cancel'}
                              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-md text-xs transition-colors disabled:bg-slate-400"
                            >
                              {isEscrowPending && pendingApproval === c.address + '-cancel'
                                ? 'Confirming...'
                                : 'Approve Cancellation'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {isEscrowError && pendingApproval === c.address && (
                      <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-xs">
                        Transaction failed. Please try again.
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
