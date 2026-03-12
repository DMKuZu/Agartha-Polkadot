'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState, useEffect, useRef } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { parseEther, formatEther, isAddress } from 'viem';
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

// ── Agreement rendering helper ─────────────────────────────────────────────────

function AgreementView({ formData, documentHash }: { formData: any; documentHash: string }) {
  if (formData?.type === 'file') {
    return (
      <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-1">
        <p className="font-semibold text-slate-800">{formData.filename}</p>
        <p className="text-slate-500">Document hash (on-chain proof):</p>
        <p className="font-mono text-slate-600 break-all">{documentHash}</p>
      </div>
    );
  }
  return (
    <pre className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono overflow-auto max-h-56">
      {buildDocument(formData as RicardianFormData)}
    </pre>
  );
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

  // ── Agreement viewing — fetched from DB by document hash ──────────────────────

  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());
  const [dealAgreements, setDealAgreements] = useState<Record<string, any>>({});

  useEffect(() => {
    const hashes = myDeals.map(d => d.documentHash).filter(Boolean) as string[];
    hashes.forEach(hash => {
      if (dealAgreements[hash]) return;
      fetch(`/api/deals/by-hash/${hash}`)
        .then(r => r.json())
        .then(({ deal }) => {
          if (deal?.form_data) {
            setDealAgreements(prev => ({ ...prev, [hash]: deal.form_data }));
          }
        })
        .catch(() => {});
    });
  }, [myDeals.length]);

  // ── New deal form state ───────────────────────────────────────────────────────

  const [showNewDeal, setShowNewDeal] = useState(false);

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]     = useState('');
  const [fileHash, setFileHash]     = useState('');
  const [isHashing, setIsHashing]   = useState(false);

  // Deal fields
  const [freelancerAddress, setFreelancerAddress] = useState('');
  const [settlementAmount,  setSettlementAmount]  = useState('');
  const [dealTitle,         setDealTitle]         = useState('');
  const [deliverables,      setDeliverables]      = useState('');
  const [deadline,          setDeadline]          = useState('');

  // Submission
  const [dealSubmitted, setDealSubmitted] = useState(false);
  const [dealCode,      setDealCode]      = useState('');
  const [formError,     setFormError]     = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileHash('');
    setIsHashing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wordArray = CryptoJS.lib.WordArray.create(evt.target?.result as ArrayBuffer);
      const hash = '0x' + CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
      setFileHash(hash);
      setIsHashing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleGenerateDealCode = async () => {
    setFormError('');
    if (!fileHash)                        return setFormError('Upload a contract file first.');
    if (!isAddress(freelancerAddress))    return setFormError('Freelancer address is not a valid Ethereum address.');
    if (!settlementAmount || parseFloat(settlementAmount) <= 0)
                                          return setFormError('Enter a valid settlement amount greater than 0.');
    if (!dealTitle.trim())                return setFormError('Enter a deal title.');
    if (!address) return;

    const id = Date.now().toString(36);
    const formData = {
      type:              'file',
      filename:          fileName,
      freelancerAddress,
      amount:            settlementAmount,
      title:             dealTitle,
      deliverables,
      deadline,
    };
    const deal = {
      id,
      clientAddress:     address,
      freelancerAddress,
      amount:            settlementAmount,
      title:             dealTitle,
      deliverables,
      deadline,
      documentHash:      fileHash,
    };
    const code = window.btoa(JSON.stringify(deal));
    setDealCode(code);
    setDealSubmitted(true);
    showToast('Deal code generated — share it with your Arbiter');

    // Persist deal to DB (best-effort — arbiter claim is the fallback)
    fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_address:    address,
        freelancer_address: freelancerAddress,
        document_hash:     fileHash,
        form_data:         formData,
        deal_code_id:      id,
      }),
    }).catch(() => {});
  };

  const resetNewDeal = () => {
    setFileName(''); setFileHash(''); setIsHashing(false);
    setFreelancerAddress(''); setSettlementAmount(''); setDealTitle('');
    setDeliverables(''); setDeadline('');
    setDealSubmitted(false); setDealCode(''); setFormError('');
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

                      {/* View Agreement */}
                      {d.documentHash && dealAgreements[d.documentHash] && (() => {
                        const formData = dealAgreements[d.documentHash];
                        const isExpanded = expandedAgreements.has(d.address);
                        return (
                          <div className="mt-2 border-t border-slate-200 pt-2">
                            <button
                              onClick={() => setExpandedAgreements(prev => {
                                const next = new Set(prev);
                                isExpanded ? next.delete(d.address) : next.add(d.address);
                                return next;
                              })}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1 rounded transition-colors"
                            >
                              {isExpanded ? 'Hide Agreement' : 'View Agreement'}
                            </button>
                            {isExpanded && (
                              <div className="mt-2">
                                <AgreementView formData={formData} documentHash={d.documentHash} />
                                <p className="text-xs text-slate-400 mt-1 font-mono break-all">Hash: {d.documentHash}</p>
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

          {/* New Deal — file upload + deal fields */}
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
                <div className="mt-4 space-y-5">

                  {/* Step 1 — Upload contract file */}
                  <div className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                    <h2 className="text-lg font-semibold mb-1 text-slate-700">1. Upload Contract File</h2>
                    <p className="text-sm text-slate-500 mb-3">
                      Upload your signed contract document. The file is hashed locally — it is never uploaded to any server.
                    </p>
                    <label className="block">
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-slate-600
                          file:mr-3 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-indigo-600 file:text-white
                          hover:file:bg-indigo-700 file:cursor-pointer cursor-pointer"
                      />
                    </label>
                    {isHashing && (
                      <p className="text-xs text-slate-500 mt-2">Computing SHA-256…</p>
                    )}
                    {fileHash && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-xs font-semibold text-green-800 mb-1">{fileName}</p>
                        <p className="text-xs text-green-700 font-mono break-all">{fileHash}</p>
                      </div>
                    )}
                  </div>

                  {/* Step 2 — Deal details */}
                  <div className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                    <h2 className="text-lg font-semibold mb-4 text-slate-700">2. Deal Details</h2>

                    <div className="space-y-4">
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
                          onChange={(e) => setFreelancerAddress(e.target.value.trim())}
                          className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 font-mono text-sm"
                        />
                        {freelancerAddress && !isAddress(freelancerAddress) && (
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
                        <p className="text-xs text-slate-400 mt-1">
                          This amount will be locked in the escrow contract and released to the Freelancer upon 2/3 approval.
                        </p>
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
                    </div>
                  </div>

                  {/* Step 3 — Generate deal code */}
                  <div className="p-5 bg-slate-50 rounded-lg border border-slate-200">
                    <h2 className="text-lg font-semibold mb-1 text-slate-700">3. Generate Deal Code</h2>
                    <p className="text-sm text-slate-500 mb-4">
                      Creates a code that encodes your deal details. Share it with your Arbiter through your own secure channel.
                    </p>

                    {formError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                        {formError}
                      </div>
                    )}

                    <button
                      onClick={handleGenerateDealCode}
                      disabled={!fileHash || isHashing}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400"
                    >
                      {isHashing ? 'Hashing file…' : 'Generate Deal Code'}
                    </button>
                  </div>

                </div>
              )}

              {/* Deal code display */}
              {showNewDeal && dealSubmitted && (
                <div className="mt-4 p-5 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="font-semibold text-indigo-800 mb-1">Deal code generated.</p>
                  <p className="text-xs text-indigo-600 mb-3">
                    Copy this code and send it to your Arbiter. They will paste it into the Arbiter Portal to load your deal.
                  </p>
                  <textarea
                    readOnly
                    value={dealCode}
                    rows={4}
                    className="w-full font-mono text-xs bg-white border border-indigo-200 rounded-md p-3 text-slate-700 resize-none focus:outline-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button
                      onClick={() => { navigator.clipboard.writeText(dealCode); showToast('Code copied to clipboard'); }}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={resetNewDeal}
                      className="text-xs text-indigo-500 hover:text-indigo-700 underline px-1"
                    >
                      Create another deal
                    </button>
                  </div>
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
