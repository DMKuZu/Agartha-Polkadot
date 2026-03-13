'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState, useEffect, useCallback } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { formatEther, isAddress } from 'viem';
import CryptoJS from 'crypto-js';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';
import { buildDocument, RicardianFormData } from '../../components/RicardianGenerator';

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

function AgreementView({ formData, documentHash }: { formData: any; documentHash: string }) {
  return (
    <>
      <pre className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono overflow-auto max-h-56">
        {buildDocument(formData as RicardianFormData)}
      </pre>
      <p className="text-xs text-slate-400 mt-1 font-mono break-all">Hash: {documentHash}</p>
    </>
  );
}

function StatusBadge({ status, arbiterAccepted, freelancerAccepted }: {
  status: string; arbiterAccepted: boolean; freelancerAccepted: boolean;
}) {
  if (status === 'cancelled')
    return <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded">Cancelled</span>;
  if (status === 'deployed')
    return <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">Deployed</span>;
  if (status === 'accepted')
    return <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded">Accepted — awaiting deployment</span>;
  // pending_acceptance or legacy 'pending'
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

  const fetchDbDeals = useCallback(async () => {
    if (!address) return;
    const r = await fetch(`/api/deals?wallet_address=${address}`).catch(() => null);
    if (!r?.ok) return;
    const { deals } = await r.json();
    setDbDeals((deals ?? []).filter((d: DbDeal) => d.status !== 'deployed'));
  }, [address]);

  useEffect(() => { fetchDbDeals(); }, [fetchDbDeals]);

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
  ]);

  const { data: dealStateData, refetch: refetchDealState } = useReadContracts({
    contracts: dealReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  const myDeals: MyDealItem[] = allEscrows
    .map((addr, i) => {
      const base = i * 8;
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
      };
    })
    .filter((d) => d.buyer?.toLowerCase() === address?.toLowerCase());

  // ── Agreement viewing for on-chain deals ──────────────────────────────────────

  const [onChainAgreements, setOnChainAgreements] = useState<Record<string, any>>({});
  const [expandedOnChain, setExpandedOnChain] = useState<Set<string>>(new Set());

  useEffect(() => {
    const hashes = myDeals.map(d => d.documentHash).filter(Boolean) as string[];
    hashes.forEach(hash => {
      if (onChainAgreements[hash]) return;
      fetch(`/api/deals/by-hash/${hash}`)
        .then(r => r.json())
        .then(({ deal }) => {
          if (deal?.form_data) setOnChainAgreements(prev => ({ ...prev, [hash]: deal.form_data }));
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

  // ── New deal form ─────────────────────────────────────────────────────────────

  const [showNewDeal, setShowNewDeal] = useState(false);
  const [dealTitle,         setDealTitle]         = useState('');
  const [deliverables,      setDeliverables]      = useState('');
  const [deadline,          setDeadline]          = useState('');
  const [settlementAmount,  setSettlementAmount]  = useState('');
  const [freelancerAddress, setFreelancerAddress] = useState('');
  const [arbiterAddress,    setArbiterAddress]    = useState('');

  const [freelancerVal, setFreelancerVal] = useState<AddrValidation>({ loading: false });
  const [arbiterVal,    setArbiterVal]    = useState<AddrValidation>({ loading: false });

  const [formError,     setFormError]     = useState('');
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [dealSubmitted, setDealSubmitted] = useState(false);

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
    if (!dealTitle.trim())                   return setFormError('Enter a deal title.');
    if (!isAddress(freelancerAddress))       return setFormError('Freelancer address is not valid.');
    if (!isAddress(arbiterAddress))          return setFormError('Arbiter address is not valid.');
    if (freelancerVal.error)                 return setFormError(freelancerVal.error);
    if (arbiterVal.error)                    return setFormError(arbiterVal.error);
    if (!freelancerVal.role)                 return setFormError('Freelancer address not yet verified. Wait a moment and retry.');
    if (!arbiterVal.role)                    return setFormError('Arbiter address not yet verified. Wait a moment and retry.');
    if (!settlementAmount || parseFloat(settlementAmount) <= 0)
                                             return setFormError('Enter a valid settlement amount > 0.');
    if (!address) return;

    const formData: RicardianFormData = {
      title:             dealTitle,
      deliverables,
      deadline,
      amount:            settlementAmount,
      clientAddress:     address,
      freelancerAddress,
    };

    const doc  = buildDocument(formData);
    const hash = '0x' + CryptoJS.SHA256(CryptoJS.enc.Utf8.parse(doc)).toString();

    setIsSubmitting(true);
    try {
      const r = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_address:    address,
          freelancer_address: freelancerAddress,
          arbiter_address:   arbiterAddress,
          document_hash:     hash,
          form_data:         formData,
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
    setDealTitle(''); setDeliverables(''); setDeadline('');
    setSettlementAmount(''); setFreelancerAddress(''); setArbiterAddress('');
    setFreelancerVal({ loading: false }); setArbiterVal({ loading: false });
    setFormError(''); setDealSubmitted(false);
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
                          <p className="text-sm font-semibold text-slate-800">{d.form_data?.title ?? '(no title)'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Freelancer: <span className="font-mono">{d.freelancer_address.slice(0, 10)}…</span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Arbiter: <span className="font-mono">{d.arbiter_address?.slice(0, 10) ?? '—'}…</span>
                          </p>
                        </div>
                        <StatusBadge
                          status={d.status}
                          arbiterAccepted={d.arbiter_accepted}
                          freelancerAccepted={d.freelancer_accepted}
                        />
                      </div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">{d.form_data?.amount ?? '?'} PAS</p>

                      {/* View agreement toggle */}
                      <button
                        onClick={() => setExpandedAgreements(prev => {
                          const next = new Set(prev);
                          isExpanded ? next.delete(d.id) : next.add(d.id);
                          return next;
                        })}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors"
                      >
                        {isExpanded ? 'Hide Agreement' : 'View Agreement'}
                      </button>

                      {isExpanded && d.form_data && (
                        <div className="mt-2">
                          <AgreementView formData={d.form_data} documentHash={d.document_hash} />
                        </div>
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

                      {d.documentHash && onChainAgreements[d.documentHash] && (() => {
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
                              {isExp ? 'Hide Agreement' : 'View Agreement'}
                            </button>
                            {isExp && (
                              <div className="mt-2">
                                <AgreementView formData={onChainAgreements[d.documentHash]} documentHash={d.documentHash} />
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
                  <h2 className="text-lg font-semibold text-slate-700">New Service Agreement</h2>
                  <p className="text-sm text-slate-500">
                    Fill in the details below. A Philippine Freelance Service Agreement will be generated and
                    sent to both your chosen Arbiter and Freelancer for review.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Deal Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Website Redesign — Phase 1"
                      value={dealTitle}
                      onChange={(e) => setDealTitle(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 text-sm"
                    />
                  </div>

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

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Deliverables</label>
                    <textarea
                      placeholder="Describe what the Freelancer is expected to deliver…"
                      value={deliverables}
                      onChange={(e) => setDeliverables(e.target.value)}
                      rows={3}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 text-sm"
                    />
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
                    {isSubmitting ? 'Submitting…' : 'Submit Deal for Review'}
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
