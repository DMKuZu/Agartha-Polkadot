'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { formatEther, isAddress } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';

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
  documentHash:     string | undefined;
  isCancelled:         boolean | undefined;
  cancelApprovalCount: bigint  | undefined;
  hasCancelApproved:   boolean | undefined;
}

interface DbDeal {
  id: string;
  deal_code_id: string;
  client_address: string;
  freelancer_address: string;
  arbiter_address: string | null;
  document_hash: string;
  form_data: any;
  status: string;
  arbiter_accepted: boolean;
  freelancer_accepted: boolean;
  escrow_address: string | null;
  created_at: string;
}

interface AddrValidation { loading: boolean; role?: string; error?: string }

// ── Agreement view helper ──────────────────────────────────────────────────────

function AgreementView({ formData, dealId, walletAddress }: {
  formData: any;
  dealId?: string;
  walletAddress?: string;
}) {
  const [fetching, setFetching] = useState(false);

  const handleViewDocument = async () => {
    if (!dealId || !walletAddress) return;
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

  if (formData?.type === 'file') {
    return (
      <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-2">
        <p className="font-semibold text-slate-800">{formData.filename ?? 'Attached document'}</p>
        {dealId && walletAddress && (
          <button
            onClick={handleViewDocument}
            disabled={fetching}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors disabled:text-slate-400"
          >
            {fetching ? 'Loading…' : 'View / Download Document'}
          </button>
        )}
      </div>
    );
  }

  return null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, arbiterAccepted, freelancerAccepted }: {
  status: string; arbiterAccepted: boolean; freelancerAccepted: boolean;
}) {
  if (status === 'cancelled')
    return <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded">Rejected</span>;
  if (status === 'deployed')
    return <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">Deployed</span>;
  if (status === 'accepted')
    return <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded">Accepted — awaiting deployment</span>;
  const n = (arbiterAccepted ? 1 : 0) + (freelancerAccepted ? 1 : 0);
  return <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">Awaiting acceptance ({n}/2)</span>;
}

export default function ClientPage() {
  const { address, isConnected } = useAccount();

  // ── Write hook ────────────────────────────────────────────────────────────────

  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
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

  useEffect(() => { if (isEscrowError) showToast('Transaction failed. Please try again.', 'error'); }, [isEscrowError]);

  // ── DB deals (pending, accepted, cancelled) ───────────────────────────────────

  const [dbDeals, setDbDeals] = useState<DbDeal[]>([]);
  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  const fetchDbDeals = useCallback(async () => {
    if (!address) return;
    const r = await fetch(`/api/deals?wallet_address=${address}`).catch(() => null);
    if (!r?.ok) return;
    const { deals } = await r.json();
    setDbDeals((deals ?? []).filter((d: DbDeal) => d.status !== 'deployed'));
  }, [address]);

  useEffect(() => { fetchDbDeals(); }, [fetchDbDeals]);

  const handleDeleteDeal = async (dealId: string) => {
    if (!address) return;
    setDeletingDealId(dealId);
    try {
      const r = await fetch(`/api/deals/${dealId}?wallet_address=${address}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Could not delete deal', 'error'); return; }
      showToast('Deal deleted');
      fetchDbDeals();
    } catch {
      showToast('Could not delete deal', 'error');
    } finally {
      setDeletingDealId(null);
    }
  };

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
    { address: addr, abi: ESCROW_ABI, functionName: 'documentHash' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isCancelled' },
    { address: addr, abi: ESCROW_ABI, functionName: 'cancelApprovalCount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'hasCancelApproved', args: address ? [address] : undefined },
  ]);

  const { data: dealStateData, refetch: refetchDealState } = useReadContracts({
    contracts: dealReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  const myDeals: MyDealItem[] = allEscrows
    .map((addr, i) => {
      const base = i * 11;
      return {
        address: addr,
        buyer:            dealStateData?.[base + 0]?.result as `0x${string}` | undefined,
        seller:           dealStateData?.[base + 1]?.result as `0x${string}` | undefined,
        settlementAmount: dealStateData?.[base + 2]?.result as bigint | undefined,
        isFunded:         dealStateData?.[base + 3]?.result as boolean | undefined,
        isReleased:       dealStateData?.[base + 4]?.result as boolean | undefined,
        approvalCount:    dealStateData?.[base + 5]?.result as bigint | undefined,
        hasApproved:      dealStateData?.[base + 6]?.result as boolean | undefined,
        documentHash:     dealStateData?.[base + 7]?.result as string | undefined,
        isCancelled:         dealStateData?.[base + 8]?.result as boolean | undefined,
        cancelApprovalCount: dealStateData?.[base + 9]?.result as bigint | undefined,
        hasCancelApproved:   dealStateData?.[base + 10]?.result as boolean | undefined,
      };
    })
    .filter((d) => d.buyer?.toLowerCase() === address?.toLowerCase());

  // ── Agreement viewing for on-chain deals (fetch DB id by hash) ────────────────

  const [onChainDealInfo, setOnChainDealInfo] = useState<Record<string, { formData: any; dealId: string }>>({});
  const [expandedOnChain, setExpandedOnChain] = useState<Set<string>>(new Set());

  useEffect(() => {
    const hashes = myDeals.map(d => d.documentHash).filter(Boolean) as string[];
    hashes.forEach(hash => {
      if (onChainDealInfo[hash]) return;
      fetch(`/api/deals/by-hash/${hash}`)
        .then(r => r.json())
        .then(({ deal }) => {
          if (deal?.form_data) {
            setOnChainDealInfo(prev => ({ ...prev, [hash]: { formData: deal.form_data, dealId: deal.id } }));
          }
        })
        .catch(() => {});
    });
  }, [myDeals.length]);

  // ── Refetch after on-chain tx ─────────────────────────────────────────────────

  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchEscrows();
    refetchDealState();
    setPendingAction(null);
    showToast('Transaction confirmed');
  }, [isEscrowTxConfirmed]);

  const handleFund = (addr: `0x${string}`, amount: bigint) => {
    setPendingAction(addr);
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'fund', value: amount });
  };

  const handleApprove = (addr: `0x${string}`) => {
    setPendingAction(addr);
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  const handleApproveCancellation = (addr: `0x${string}`) => {
    setPendingAction(addr + '-cancel');
    writeEscrow({ address: addr, abi: ESCROW_ABI, functionName: 'approveCancellation' });
  };

  // ── New deal form ─────────────────────────────────────────────────────────────

  const [showNewDeal, setShowNewDeal]         = useState(false);
  const [freelancerAddress, setFreelancerAddress] = useState('');
  const [arbiterAddress,    setArbiterAddress]    = useState('');
  const [settlementAmount,  setSettlementAmount]  = useState('');
  const [selectedFile,      setSelectedFile]      = useState<File | null>(null);

  const [freelancerVal, setFreelancerVal] = useState<AddrValidation>({ loading: false });
  const [arbiterVal,    setArbiterVal]    = useState<AddrValidation>({ loading: false });

  const [formError,     setFormError]     = useState('');
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [dealSubmitted, setDealSubmitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAddress = async (
    addr: string,
    expected: 'freelancer' | 'arbiter',
    setVal: (v: AddrValidation) => void
  ) => {
    if (!addr || !isAddress(addr)) { setVal({ loading: false }); return; }
    setVal({ loading: true });
    try {
      const r = await fetch(`/api/users/${addr}`);
      const { user } = await r.json();
      if (!user) { setVal({ loading: false, error: 'Address not registered' }); return; }
      if (user.role !== expected) {
        setVal({ loading: false, error: `Registered as '${user.role}', not '${expected}'` });
      } else {
        setVal({ loading: false, role: user.role });
      }
    } catch {
      setVal({ loading: false, error: 'Could not verify address' });
    }
  };

  const handleSubmitDeal = async () => {
    setFormError('');
    if (!isAddress(freelancerAddress))  return setFormError('Freelancer address is not valid.');
    if (!isAddress(arbiterAddress))     return setFormError('Arbiter address is not valid.');
    if (freelancerVal.error)            return setFormError(freelancerVal.error);
    if (arbiterVal.error)               return setFormError(arbiterVal.error);
    if (!freelancerVal.role)            return setFormError('Freelancer address not yet verified. Wait a moment and retry.');
    if (!arbiterVal.role)               return setFormError('Arbiter address not yet verified. Wait a moment and retry.');
    if (!settlementAmount || parseFloat(settlementAmount) <= 0)
                                        return setFormError('Enter a valid settlement amount > 0.');
    if (!selectedFile)                  return setFormError('Please attach a document.');
    if (!address) return;

    setIsSubmitting(true);

    try {
      // Step 1: Upload file
      const uploadForm = new FormData();
      uploadForm.append('file', selectedFile);
      uploadForm.append('wallet_address', address);

      const uploadRes = await fetch('/api/deals/upload', { method: 'POST', body: uploadForm });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        setFormError(uploadData?.error ?? 'File upload failed. Please try again.');
        return;
      }

      const { storage_path, document_hash, filename } = uploadData;

      // Step 2: Create deal record
      const formData = {
        type:         'file',
        filename,
        storage_path,
        amount:       settlementAmount,
      };

      const r = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_address:     address,
          freelancer_address: freelancerAddress,
          arbiter_address:    arbiterAddress,
          document_hash,
          form_data:          formData,
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        setFormError(data?.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setDealSubmitted(true);
      fetchDbDeals();
      showToast('Deal submitted — awaiting acceptance from Arbiter and Freelancer');
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetNewDeal = () => {
    setFreelancerAddress(''); setArbiterAddress(''); setSettlementAmount('');
    setSelectedFile(null);
    setFreelancerVal({ loading: false }); setArbiterVal({ loading: false });
    setFormError(''); setDealSubmitted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors">
              View Global Case Ledger →
            </Link>
          </div>

          <hr className="border-slate-200 mb-8" />

          {!isConnected && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800 mb-6">
              Connect your wallet to continue.
            </div>
          )}

          {/* Pending DB deals (pre-deployment) */}
          {isConnected && dbDeals.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-slate-700 mb-4">Pending Deals</h2>
              <div className="space-y-3">
                {dbDeals.map((d) => {
                  const isExpanded = expandedAgreements.has(d.id);
                  return (
                    <div key={d.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {d.form_data?.filename ?? d.form_data?.title ?? '(no document)'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Freelancer: <span className="font-mono">{d.freelancer_address.slice(0, 10)}…</span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Arbiter: <span className="font-mono">{d.arbiter_address?.slice(0, 10) ?? '—'}…</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <StatusBadge
                            status={d.status}
                            arbiterAccepted={d.arbiter_accepted}
                            freelancerAccepted={d.freelancer_accepted}
                          />
                          {d.status === 'cancelled' && (
                            <button
                              onClick={() => handleDeleteDeal(d.id)}
                              disabled={deletingDealId === d.id}
                              className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              {deletingDealId === d.id ? 'Deleting…' : 'Delete Deal'}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">{d.form_data?.amount ?? '?'} PAS</p>

                      {d.form_data?.type === 'file' && (
                        <>
                          <button
                            onClick={() => setExpandedAgreements(prev => {
                              const next = new Set(prev);
                              isExpanded ? next.delete(d.id) : next.add(d.id);
                              return next;
                            })}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors"
                          >
                            {isExpanded ? 'Hide Document Info' : 'View Document Info'}
                          </button>
                          {isExpanded && (
                            <div className="mt-2">
                              <AgreementView formData={d.form_data} dealId={d.id} walletAddress={address} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* On-chain deployed deals */}
          {isConnected && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-700">My Deployed Deals</h2>
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
                  <p className="text-sm text-slate-600">No deployed escrow contracts found.</p>
                  <p className="text-xs text-slate-400 mt-1">Submit a deal below. Once the Arbiter deploys it, it will appear here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myDeals.map((d) => (
                    <div key={d.address} className="border border-slate-200 rounded-lg p-5 bg-slate-50">

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

                      {d.settlementAmount !== undefined && (
                        <p className="text-sm font-semibold text-slate-800 mb-3">{formatEther(d.settlementAmount)} PAS</p>
                      )}

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
                              {isEscrowPending && pendingAction === d.address ? 'Confirming...' : 'Approve Release'}
                            </button>
                          )}
                        </div>
                      )}

                      {d.isReleased && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 font-medium text-center">
                          Payment released to Freelancer.
                        </div>
                      )}

                      {d.isCancelled && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 font-medium text-center">
                          Deal cancelled — funds refunded to your wallet.
                        </div>
                      )}

                      {d.isFunded && !d.isReleased && !d.isCancelled && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <p className="text-xs font-medium text-slate-500 mb-2">Cancel Deal (2-of-3 approval required)</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex gap-1.5">
                              {[0, 1].map((i) => (
                                <div key={i} className={`w-4 h-4 rounded-full border-2 ${
                                  i < Number(d.cancelApprovalCount ?? 0)
                                    ? 'bg-red-500 border-red-600'
                                    : 'bg-slate-200 border-slate-300'
                                }`} />
                              ))}
                            </div>
                            <span className="text-xs text-slate-500">{String(d.cancelApprovalCount ?? 0)} / 2 cancel approvals</span>
                          </div>
                          {d.hasCancelApproved ? (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium text-center">
                              You approved cancellation. Waiting for another party.
                            </div>
                          ) : (
                            <button
                              onClick={() => handleApproveCancellation(d.address)}
                              disabled={isEscrowPending && pendingAction === d.address + '-cancel'}
                              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-md text-xs transition-colors disabled:bg-slate-400"
                            >
                              {isEscrowPending && pendingAction === d.address + '-cancel'
                                ? 'Confirming...'
                                : 'Approve Cancellation'}
                            </button>
                          )}
                        </div>
                      )}

                      {d.documentHash && onChainDealInfo[d.documentHash] && (() => {
                        const { formData, dealId } = onChainDealInfo[d.documentHash];
                        const isExp = expandedOnChain.has(d.address);
                        return (
                          <div className="mt-2 border-t border-slate-200 pt-2">
                            <button
                              onClick={() => setExpandedOnChain(prev => {
                                const next = new Set(prev);
                                isExp ? next.delete(d.address) : next.add(d.address);
                                return next;
                              })}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors"
                            >
                              {isExp ? 'Hide Document' : 'View Document'}
                            </button>
                            {isExp && (
                              <div className="mt-2">
                                <AgreementView formData={formData} dealId={dealId} walletAddress={address} />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {isEscrowError && pendingAction === d.address && (
                        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-xs">
                          Transaction failed. Please try again.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <hr className="border-slate-200 mb-6" />

          {/* New Deal Form */}
          {isConnected && (
            <div>
              <button
                onClick={() => setShowNewDeal(!showNewDeal)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              >
                <span className="text-sm font-semibold text-indigo-800">+ Create New Deal</span>
                <span className="text-xs text-indigo-500">{showNewDeal ? 'Collapse ▲' : 'Expand ▼'}</span>
              </button>

              {showNewDeal && !dealSubmitted && (
                <div className="mt-4 p-5 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
                  <h2 className="text-lg font-semibold text-slate-700">New Deal</h2>
                  <p className="text-sm text-slate-500">
                    Upload your agreement document and fill in the party addresses and amount.
                    Both Arbiter and Freelancer must accept before the escrow contract is deployed.
                  </p>

                  {/* Freelancer */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Freelancer Wallet Address <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={freelancerAddress}
                      onChange={(e) => { setFreelancerAddress(e.target.value.trim()); setFreelancerVal({ loading: false }); }}
                      onBlur={() => validateAddress(freelancerAddress, 'freelancer', setFreelancerVal)}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 font-mono text-sm"
                    />
                    {freelancerVal.loading && <p className="text-xs text-slate-400 mt-1">Verifying…</p>}
                    {freelancerVal.role   && <p className="text-xs text-green-600 mt-1">Registered as Freelancer</p>}
                    {freelancerVal.error  && <p className="text-xs text-red-500 mt-1">{freelancerVal.error}</p>}
                    {freelancerAddress && !isAddress(freelancerAddress) && !freelancerVal.loading && (
                      <p className="text-xs text-red-500 mt-1">Invalid address format.</p>
                    )}
                  </div>

                  {/* Arbiter */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Arbiter Wallet Address <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={arbiterAddress}
                      onChange={(e) => { setArbiterAddress(e.target.value.trim()); setArbiterVal({ loading: false }); }}
                      onBlur={() => validateAddress(arbiterAddress, 'arbiter', setArbiterVal)}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 font-mono text-sm"
                    />
                    {arbiterVal.loading && <p className="text-xs text-slate-400 mt-1">Verifying…</p>}
                    {arbiterVal.role   && <p className="text-xs text-green-600 mt-1">Registered as Arbiter</p>}
                    {arbiterVal.error  && <p className="text-xs text-red-500 mt-1">{arbiterVal.error}</p>}
                    {arbiterAddress && !isAddress(arbiterAddress) && !arbiterVal.loading && (
                      <p className="text-xs text-red-500 mt-1">Invalid address format.</p>
                    )}
                  </div>

                  {/* Settlement Amount */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Settlement Amount (PAS) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 2.5"
                      value={settlementAmount}
                      onChange={(e) => setSettlementAmount(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-1">Locked in escrow, released to Freelancer upon 2/3 approval.</p>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agreement Document <span className="text-red-500">*</span></label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="*/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-300 rounded-md p-1"
                    />
                    {selectedFile && (
                      <p className="text-xs text-green-600 mt-1">
                        Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Any file type, max 10 MB.</p>
                  </div>

                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                      {formError}
                    </div>
                  )}

                  <button
                    onClick={handleSubmitDeal}
                    disabled={isSubmitting}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
                  >
                    {isSubmitting ? 'Uploading & Submitting…' : 'Submit Deal for Review'}
                  </button>
                </div>
              )}

              {showNewDeal && dealSubmitted && (
                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-lg">
                  <p className="font-semibold text-green-800 mb-1">Deal submitted successfully.</p>
                  <p className="text-sm text-green-700 mb-3">
                    Your Arbiter and Freelancer will see the deal in their Pending Acceptance queues.
                    Both must accept before the Arbiter can deploy the smart contract.
                  </p>
                  <button
                    onClick={resetNewDeal}
                    className="text-sm font-semibold text-green-700 hover:text-green-900 border border-green-300 px-4 py-2 rounded transition-colors"
                  >
                    Create another deal
                  </button>
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
