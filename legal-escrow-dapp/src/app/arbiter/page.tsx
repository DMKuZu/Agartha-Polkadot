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
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { parseEther, formatEther, isAddress, parseEventLogs, keccak256 } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI, LEDGER_ADDRESS, LEDGER_ABI } from '../../contracts/abis';
import { RoleGuard } from '../../components/RoleGuard';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };
type LedgerStep = 'register' | 'deposit' | 'disburse' | 'close';
type LedgerDone = { registered: boolean; depositRecorded: boolean; disbursementRecorded: boolean; closed: boolean };

interface MyCaseItem {
  address: `0x${string}`;
  buyer:   `0x${string}` | undefined;
  seller:  `0x${string}` | undefined;
  settlementAmount: bigint | undefined;
  isFunded:      boolean | undefined;
  isReleased:    boolean | undefined;
  approvalCount: bigint  | undefined;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEDGER_KEY = (addr: string) => `agartha_ledger_${addr.toLowerCase()}`;
const BLANK_LEDGER: LedgerDone = { registered: false, depositRecorded: false, disbursementRecorded: false, closed: false };

function loadLedgerProgress(addr: string): LedgerDone {
  try {
    const saved = localStorage.getItem(LEDGER_KEY(addr));
    return saved ? JSON.parse(saved) : BLANK_LEDGER;
  } catch {
    return BLANK_LEDGER;
  }
}

export default function ArbiterPage() {
  const { address, isConnected } = useAccount();

  // ── Write hooks ───────────────────────────────────────────────────────────────

  const {
    writeContract: writeFactory,
    isPending: isFactoryPending,
    isError: isFactoryError,
    error: factoryError,
    data: factoryTxHash,
  } = useWriteContract();

  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
    error: escrowError,
    data: escrowTxHash,
  } = useWriteContract();

  const {
    writeContract: writeLedger,
    isPending: isLedgerPending,
    isError: isLedgerError,
    error: ledgerError,
    data: ledgerTxHash,
  } = useWriteContract();

  // ── Receipt watchers ─────────────────────────────────────────────────────────

  const { data: factoryReceipt } = useWaitForTransactionReceipt({ hash: factoryTxHash });
  const { isSuccess: isEscrowTxConfirmed } = useWaitForTransactionReceipt({ hash: escrowTxHash });
  const { isSuccess: isLedgerTxConfirmed } = useWaitForTransactionReceipt({ hash: ledgerTxHash });

  // ── Form state ───────────────────────────────────────────────────────────────

  const [documentHash,     setDocumentHash]     = useState<string>('');
  const [buyerAddress,     setBuyerAddress]     = useState<string>('');
  const [sellerAddress,    setSellerAddress]    = useState<string>('');
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [casePurpose,      setCasePurpose]      = useState<string>('');
  const [validationError,  setValidationError]  = useState<string>('');

  // ── Active escrow ─────────────────────────────────────────────────────────────

  const [deployedEscrowAddress, setDeployedEscrowAddress] = useState<`0x${string}` | null>(null);

  const caseId = deployedEscrowAddress ? keccak256(deployedEscrowAddress) : null;

  // ── CPRA ledger step tracking (persisted per escrow in localStorage) ──────────

  const [currentLedgerStep, setCurrentLedgerStep] = useState<LedgerStep | null>(null);
  const [ledgerDone, setLedgerDone] = useState<LedgerDone>(BLANK_LEDGER);

  useEffect(() => {
    if (!deployedEscrowAddress) return;
    localStorage.setItem(LEDGER_KEY(deployedEscrowAddress), JSON.stringify(ledgerDone));
  }, [ledgerDone, deployedEscrowAddress]);

  // ── All cases from factory (on-chain) ─────────────────────────────────────────

  const {
    data: allEscrowsRaw,
    isLoading: allEscrowsLoading,
    refetch: refetchAllEscrows,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getDeployedEscrows',
    query: { enabled: !!address },
  });

  const allEscrows = (allEscrowsRaw ?? []) as `0x${string}`[];

  const allCasesReads = allEscrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'lawyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'buyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'seller' },
    { address: addr, abi: ESCROW_ABI, functionName: 'settlementAmount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'approvalCount' },
  ]);

  const { data: allCasesData, refetch: refetchAllCases } = useReadContracts({
    contracts: allCasesReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  const myCases: MyCaseItem[] = allEscrows
    .map((addr, i) => {
      const base = i * 7;
      return {
        address: addr,
        lawyer:           allCasesData?.[base + 0]?.result as `0x${string}` | undefined,
        buyer:            allCasesData?.[base + 1]?.result as `0x${string}` | undefined,
        seller:           allCasesData?.[base + 2]?.result as `0x${string}` | undefined,
        settlementAmount: allCasesData?.[base + 3]?.result as bigint | undefined,
        isFunded:         allCasesData?.[base + 4]?.result as boolean | undefined,
        isReleased:       allCasesData?.[base + 5]?.result as boolean | undefined,
        approvalCount:    allCasesData?.[base + 6]?.result as bigint | undefined,
      };
    })
    .filter((c) => c.lawyer?.toLowerCase() === address?.toLowerCase());

  // ── Load a case from on-chain history ─────────────────────────────────────────

  const loadCase = (c: MyCaseItem) => {
    setDeployedEscrowAddress(c.address);
    setBuyerAddress(c.buyer ?? '');
    setSellerAddress(c.seller ?? '');
    setSettlementAmount(c.settlementAmount !== undefined ? formatEther(c.settlementAmount) : '');
    setLedgerDone(loadLedgerProgress(c.address));
    setCurrentLedgerStep(null);
  };

  // ── Parse EscrowCreated log when factory receipt arrives ─────────────────────

  useEffect(() => {
    if (!factoryReceipt) return;
    const logs = parseEventLogs({ abi: FACTORY_ABI, eventName: 'EscrowCreated', logs: factoryReceipt.logs });
    if (logs.length > 0) {
      const escrowAddr = (logs[0] as any).args.escrowAddress as `0x${string}`;
      setDeployedEscrowAddress(escrowAddr);
      setLedgerDone(BLANK_LEDGER);
      const escrowMap = JSON.parse(localStorage.getItem('agartha_escrow_map') || '{}');
      escrowMap[buyerAddress.toLowerCase()] = escrowAddr;
      localStorage.setItem('agartha_escrow_map', JSON.stringify(escrowMap));
      refetchAllEscrows();
      refetchAllCases();
      showToast('Contract deployed successfully');
    }
  }, [factoryReceipt]);

  // ── Read active escrow state ──────────────────────────────────────────────────

  const { data: isFundedRaw,                 refetch: refetchFunded    } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'isFunded',
    query: { enabled: !!deployedEscrowAddress },
  });
  const isFunded = isFundedRaw as boolean | undefined;

  const { data: approvalCountRaw,            refetch: refetchApprovals } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'approvalCount',
    query: { enabled: !!deployedEscrowAddress },
  });
  const approvalCount = approvalCountRaw as bigint | undefined;

  const { data: isReleasedRaw,               refetch: refetchReleased  } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'isReleased',
    query: { enabled: !!deployedEscrowAddress },
  });
  const isReleased = isReleasedRaw as boolean | undefined;

  const { data: hasCurrentWalletApprovedRaw, refetch: refetchApproved  } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'hasApproved',
    args: address ? [address] : undefined,
    query: { enabled: !!deployedEscrowAddress && !!address },
  });
  const hasCurrentWalletApproved = hasCurrentWalletApprovedRaw as boolean | undefined;

  // ── Read lawFirmAdmin from ledger ────────────────────────────────────────────

  const { data: lawFirmAdminRaw } = useReadContract({
    address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'lawFirmAdmin',
  });
  const lawFirmAdmin = lawFirmAdminRaw as `0x${string}` | undefined;
  const isAdmin = !!(address && lawFirmAdmin && address.toLowerCase() === lawFirmAdmin.toLowerCase());

  // ── Network guard ─────────────────────────────────────────────────────────────

  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const ALLOWED_CHAINS = [31337, 11155111, 420420417];
  const isWrongNetwork = isConnected && !ALLOWED_CHAINS.includes(chainId);

  // ── Toast system ──────────────────────────────────────────────────────────────

  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = (message: string, type: ToastEntry['type'] = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  useEffect(() => { if (isFactoryError) showToast('Deploy transaction failed', 'error'); }, [isFactoryError]);
  useEffect(() => { if (isEscrowError)  showToast('Transaction failed', 'error');         }, [isEscrowError]);
  useEffect(() => { if (isLedgerError)  showToast('Ledger write failed', 'error');        }, [isLedgerError]);

  // ── Refetch escrow state after escrow tx ─────────────────────────────────────

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchFunded(); refetchApprovals(); refetchReleased(); refetchApproved();
    refetchAllCases();
    showToast('Transaction confirmed');
  }, [isEscrowTxConfirmed]);

  // ── Advance ledger step tracking after each ledger tx ────────────────────────

  useEffect(() => {
    if (!isLedgerTxConfirmed || !currentLedgerStep) return;
    setLedgerDone(prev => ({
      ...prev,
      registered:           prev.registered           || currentLedgerStep === 'register',
      depositRecorded:      prev.depositRecorded       || currentLedgerStep === 'deposit',
      disbursementRecorded: prev.disbursementRecorded  || currentLedgerStep === 'disburse',
      closed:               prev.closed                || currentLedgerStep === 'close',
    }));
    showToast('Ledger entry recorded');
  }, [isLedgerTxConfirmed]);

  // ── Pending deals from localStorage ─────────────────────────────────────────

  const [pendingDeals, setPendingDeals] = useState<any[]>([]);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('agartha_pending_deals') || '[]');
    setPendingDeals(stored);
  }, []);

  const prefillFromDeal = (deal: any) => {
    setBuyerAddress(deal.clientAddress || '');
    setSellerAddress(deal.freelancerAddress || '');
    setSettlementAmount(deal.amount || '');
    setCasePurpose(deal.title || '');
    setDocumentHash(deal.documentHash || '');
    setDeployedEscrowAddress(null);
    setLedgerDone(BLANK_LEDGER);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDeployContract = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    if (!documentHash)    return setValidationError('Please enter a document hash first.');
    if (!buyerAddress || !sellerAddress || !settlementAmount)
                          return setValidationError('Please fill in all fields.');
    if (!isAddress(buyerAddress))  return setValidationError('Client address is not a valid Ethereum address.');
    if (!isAddress(sellerAddress)) return setValidationError('Freelancer address is not a valid Ethereum address.');
    if (buyerAddress.toLowerCase() === sellerAddress.toLowerCase())
                          return setValidationError('Client and Freelancer cannot be the same address.');
    if (parseFloat(settlementAmount) <= 0)
                          return setValidationError('Settlement amount must be greater than 0.');
    writeFactory({
      address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'createCase',
      args: [
        buyerAddress  as `0x${string}`,
        sellerAddress as `0x${string}`,
        address       as `0x${string}`,
        parseEther(settlementAmount),
        documentHash,
      ],
    });
  };

  const handleApprove = () => {
    if (!deployedEscrowAddress) return;
    writeEscrow({ address: deployedEscrowAddress, abi: ESCROW_ABI, functionName: 'approveRelease' });
  };

  const handleRegisterCase = () => {
    if (!caseId || !deployedEscrowAddress) return;
    setCurrentLedgerStep('register');
    writeLedger({
      address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'registerCase',
      args: [caseId, buyerAddress as `0x${string}`, deployedEscrowAddress, casePurpose || 'Settlement Case'],
    });
  };

  const handleRecordDeposit = () => {
    if (!caseId) return;
    setCurrentLedgerStep('deposit');
    writeLedger({ address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'recordDeposit', args: [caseId, parseEther(settlementAmount)] });
  };

  const handleRecordDisbursement = () => {
    if (!caseId) return;
    setCurrentLedgerStep('disburse');
    writeLedger({ address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'recordDisbursement', args: [caseId, parseEther(settlementAmount)] });
  };

  const handleCloseCase = () => {
    if (!caseId) return;
    setCurrentLedgerStep('close');
    writeLedger({ address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'closeCase', args: [caseId] });
  };

  // ── UI helpers ───────────────────────────────────────────────────────────────

  const LedgerStepRow = ({
    label, available, done, onAction, disabled,
  }: { label: string; available: boolean; done: boolean; onAction: () => void; disabled: boolean }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      {done ? (
        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">Recorded</span>
      ) : available ? (
        <button
          onClick={onAction}
          disabled={disabled}
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition-colors disabled:bg-slate-400"
        >
          {disabled ? 'Confirming...' : 'Record'}
        </button>
      ) : (
        <span className="text-xs text-slate-400">Waiting</span>
      )}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <RoleGuard requiredRole="arbiter">
      <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
        <div className="bg-white p-10 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-3 text-slate-800">Arbiter Portal</h1>
            <p className="text-slate-500 mb-4">Review pending deals, deploy escrow contracts, and manage CPRA compliance.</p>
            <div className="flex justify-center mb-4"><ConnectButton /></div>
            <div className="flex justify-center mb-4">
              <Link href="/"
                className="inline-block text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md transition-colors">
                ← Switch Role
              </Link>
            </div>
          </div>

          <hr className="border-slate-200 mb-8" />

          {/* Wrong-network guard */}
          {isWrongNetwork && (
            <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg text-center">
              <p className="text-sm font-semibold text-red-800 mb-1">Wrong Network</p>
              <p className="text-xs text-red-600 mb-3">
                Please switch to Polkadot EVM Testnet (420420417), Hardhat Local (31337), or Sepolia (11155111).
              </p>
              <div className="flex justify-center gap-2">
                <button onClick={() => switchChain({ chainId: 420420417 })}
                  className="text-xs font-semibold bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded transition-colors">
                  Switch to Polkadot
                </button>
                <button onClick={() => switchChain({ chainId: 31337 })}
                  className="text-xs font-semibold bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded transition-colors">
                  Switch to Hardhat
                </button>
                <button onClick={() => switchChain({ chainId: 11155111 })}
                  className="text-xs font-semibold bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded transition-colors">
                  Switch to Sepolia
                </button>
              </div>
            </div>
          )}

          {/* My Cases — on-chain history */}
          {isConnected && (
            <div className="mb-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-700">My Cases</h2>
                <button
                  onClick={() => { refetchAllEscrows(); refetchAllCases(); }}
                  className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>

              {allEscrowsLoading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : myCases.length === 0 ? (
                <p className="text-sm text-slate-500">No cases deployed with this wallet yet.</p>
              ) : (
                <div className="space-y-2">
                  {myCases.map((c) => (
                    <div key={c.address} className={`border rounded-md p-4 transition-colors ${
                      deployedEscrowAddress === c.address
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-slate-600 break-all">{c.address}</p>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                            <span>Client: <span className="font-mono">{c.buyer?.slice(0, 8)}…</span></span>
                            <span>Freelancer: <span className="font-mono">{c.seller?.slice(0, 8)}…</span></span>
                            {c.settlementAmount !== undefined && (
                              <span className="font-semibold text-slate-700">{formatEther(c.settlementAmount)} PAS</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.isReleased ? (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-semibold">Released</span>
                          ) : c.isFunded ? (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">Funded</span>
                          ) : (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Awaiting Funding</span>
                          )}
                          <button
                            onClick={() => loadCase(c)}
                            className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
                              deployedEscrowAddress === c.address
                                ? 'bg-blue-200 text-blue-800 cursor-default'
                                : 'bg-slate-700 hover:bg-slate-800 text-white'
                            }`}
                          >
                            {deployedEscrowAddress === c.address ? 'Active' : 'Load'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Deals Queue */}
          {pendingDeals.length > 0 && (
            <div className="mb-8 p-6 bg-indigo-50 rounded-lg border border-indigo-200">
              <h2 className="text-lg font-semibold mb-4 text-indigo-800">Pending Deal Requests</h2>
              <div className="space-y-3">
                {pendingDeals.map((deal) => (
                  <div key={deal.id} className="bg-white rounded-md border border-indigo-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{deal.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {deal.amount} PAS · Client: <span className="font-mono">{deal.clientAddress?.slice(0, 10)}…</span>
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedDeal(expandedDeal === deal.id ? null : deal.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2 py-1 rounded transition-colors"
                        >
                          {expandedDeal === deal.id ? 'Collapse' : 'Review'}
                        </button>
                        <button
                          onClick={() => { prefillFromDeal(deal); setExpandedDeal(null); }}
                          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition-colors"
                        >
                          Deploy
                        </button>
                      </div>
                    </div>

                    {expandedDeal === deal.id && (
                      <div className="mt-3 pt-3 border-t border-indigo-100 text-xs space-y-1.5">
                        <div><span className="text-slate-500">Client:</span> <span className="font-mono text-slate-700 break-all">{deal.clientAddress}</span></div>
                        <div><span className="text-slate-500">Freelancer:</span> <span className="font-mono text-slate-700 break-all">{deal.freelancerAddress}</span></div>
                        <div><span className="text-slate-500">Amount:</span> <span className="font-semibold text-slate-700">{deal.amount} PAS</span></div>
                        <div><span className="text-slate-500">Deadline:</span> <span className="text-slate-700">{deal.deadline}</span></div>
                        {deal.deliverables && (
                          <div>
                            <span className="text-slate-500">Deliverables:</span>
                            <p className="mt-1 text-slate-700 bg-slate-50 rounded p-2 whitespace-pre-wrap">{deal.deliverables}</p>
                          </div>
                        )}
                        <div><span className="text-slate-500">Document Hash:</span> <span className="font-mono text-slate-700 break-all">{deal.documentHash}</span></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Document Hash */}
          <div className="mt-4 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">1. Document Hash</h2>
            <p className="text-sm text-slate-500 mb-3">
              Pre-filled from a pending deal, or enter a hash manually.
            </p>
            <input
              type="text"
              placeholder="0x… (SHA256 document hash)"
              className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
              value={documentHash}
              onChange={(e) => setDocumentHash(e.target.value.trim())}
            />
            {documentHash && (
              <p className="text-xs text-green-700 mt-1 font-mono break-all">{documentHash}</p>
            )}
          </div>

          {/* Step 2: Deploy Contract */}
          {isConnected && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">2. Deploy Settlement Contract</h2>
              <p className="text-sm text-slate-500 mb-4">
                Your connected wallet{' '}
                <span className="font-mono font-semibold text-slate-700">{address}</span>{' '}
                will be recorded as the <strong>Arbiter</strong>.
              </p>

              <form onSubmit={handleDeployContract} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Wallet Address</label>
                  <input type="text" placeholder="0x..."
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                    value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value.trim())} />
                  {buyerAddress && !isAddress(buyerAddress) && <p className="text-xs text-red-500 mt-1">Invalid address format.</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Freelancer Wallet Address</label>
                  <input type="text" placeholder="0x..."
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                    value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value.trim())} />
                  {sellerAddress && !isAddress(sellerAddress) && <p className="text-xs text-red-500 mt-1">Invalid address format.</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Settlement Amount (PAS)</label>
                  <input type="number" step="0.01" min="0" placeholder="e.g. 1.5"
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Case Purpose / Description</label>
                  <input type="text" placeholder="e.g. Web development — landing page project"
                    className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black text-sm"
                    value={casePurpose} onChange={(e) => setCasePurpose(e.target.value)} />
                </div>

                {validationError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200 text-sm">{validationError}</div>
                )}

                <button type="submit" disabled={isFactoryPending || !documentHash}
                  className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400">
                  {isFactoryPending ? 'Confirming in Wallet...' : 'Deploy Smart Contract'}
                </button>

                {deployedEscrowAddress && (
                  <div className="mt-2 p-4 bg-green-100 text-green-800 rounded-md border border-green-300">
                    <p className="font-semibold">Active escrow contract:</p>
                    <p className="text-xs mt-1 text-green-700">Address:</p>
                    <p className="text-xs break-all font-mono mt-1">{deployedEscrowAddress}</p>
                    <p className="text-xs text-green-600 mt-2">Share this address with the Client so they can fund the escrow.</p>
                  </div>
                )}

                {isFactoryError && (
                  <div className="mt-2 p-4 bg-red-100 text-red-800 rounded-md border border-red-300">
                    <p className="font-semibold">Transaction failed.</p>
                    <p className="text-xs break-all mt-1 font-mono">{factoryError?.message}</p>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Awaiting Funding notice */}
          {deployedEscrowAddress && isConnected && !isFunded && !isReleased && (
            <div className="mt-8 p-5 bg-amber-50 rounded-lg border border-amber-200">
              <h2 className="text-lg font-semibold mb-1 text-amber-800">3. Awaiting Client Funding</h2>
              <p className="text-sm text-amber-700">
                Escrow deployed. Share the contract address with the Client — they must deposit{' '}
                <strong>{settlementAmount} PAS</strong> to activate the escrow.
              </p>
              <p className="text-xs font-mono text-amber-600 mt-2 break-all">{deployedEscrowAddress}</p>
            </div>
          )}

          {/* Approve Release */}
          {deployedEscrowAddress && isConnected && isFunded && !isReleased && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">3. Approve Release</h2>
              <p className="text-sm text-slate-500 mb-4">
                Each party (Client, Freelancer, Arbiter) must connect their wallet and approve. Funds release automatically at 2 of 3.
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
              {hasCurrentWalletApproved ? (
                <div className="p-3 bg-green-50 text-green-800 rounded-md border border-green-200 text-sm font-medium">
                  This wallet has already approved.
                </div>
              ) : (
                <button onClick={handleApprove} disabled={isEscrowPending}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400">
                  {isEscrowPending ? 'Confirming in Wallet...' : 'Approve Release'}
                </button>
              )}
              {isEscrowError && (
                <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs font-mono break-all">
                  {escrowError?.message}
                </div>
              )}
            </div>
          )}

          {/* Settlement Complete */}
          {deployedEscrowAddress && isReleased && (
            <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-300 text-center">
              <h2 className="text-2xl font-bold text-green-800 mb-2">Settlement Complete</h2>
              <p className="text-sm text-green-700">Funds have been released to the Freelancer.</p>
              <p className="text-xs font-mono text-green-600 mt-3 break-all">Escrow: {deployedEscrowAddress}</p>
            </div>
          )}

          {/* CPRA Ledger */}
          {deployedEscrowAddress && isConnected && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">CPRA Compliance Ledger</h2>
              <p className="text-sm text-slate-500 mb-4">
                Record each phase of the settlement to the on-chain audit trail. Requires the <strong>law firm admin</strong> wallet.
              </p>

              {lawFirmAdmin && (
                <div className={`mb-4 p-3 rounded-md border text-xs font-mono break-all ${
                  isAdmin
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  {isAdmin ? (
                    <span>Admin wallet connected. You can record to the ledger.</span>
                  ) : (
                    <span>
                      Admin required: <strong>{lawFirmAdmin}</strong>
                      <br />Switch MetaMask to this wallet to record ledger entries.
                    </span>
                  )}
                </div>
              )}

              <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                <LedgerStepRow
                  label="1. Register Case"
                  available={true}
                  done={ledgerDone.registered}
                  onAction={handleRegisterCase}
                  disabled={isLedgerPending || !isAdmin}
                />
                <LedgerStepRow
                  label="2. Record Deposit"
                  available={!!isFunded}
                  done={ledgerDone.depositRecorded}
                  onAction={handleRecordDeposit}
                  disabled={isLedgerPending || !isAdmin}
                />
                <LedgerStepRow
                  label="3. Record Disbursement"
                  available={!!isReleased}
                  done={ledgerDone.disbursementRecorded}
                  onAction={handleRecordDisbursement}
                  disabled={isLedgerPending || !isAdmin}
                />
                <LedgerStepRow
                  label="4. Close Case"
                  available={ledgerDone.disbursementRecorded}
                  done={ledgerDone.closed}
                  onAction={handleCloseCase}
                  disabled={isLedgerPending || !isAdmin}
                />
              </div>

              {isLedgerError && (
                <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs font-mono break-all">
                  {ledgerError?.message}
                </div>
              )}

              {ledgerDone.closed && (
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-md text-sm text-indigo-800 font-medium text-center">
                  Case fully recorded and closed in the CPRA ledger.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Toast notifications */}
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
                t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </main>
    </RoleGuard>
  );
}
