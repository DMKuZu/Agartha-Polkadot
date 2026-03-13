'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
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

// ── View document button ───────────────────────────────────────────────────────

function ViewDocumentButton({ dealId, walletAddress }: { dealId: string; walletAddress: string }) {
  const [fetching, setFetching] = React.useState(false);

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

function CpraBadge({ closed }: { closed: boolean | undefined }) {
  if (closed === undefined) return null;
  return closed
    ? <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-1 rounded">CPRA Filed</span>
    : <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">CPRA Pending</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };
type LedgerStep = 'register' | 'deposit' | 'disburse' | 'close' | 'finalize' | 'cancel-close';
type LedgerDone = { registered: boolean; depositRecorded: boolean; disbursementRecorded: boolean; closed: boolean };

interface MyCaseItem {
  address: `0x${string}`;
  buyer:   `0x${string}` | undefined;
  seller:  `0x${string}` | undefined;
  settlementAmount: bigint | undefined;
  isFunded:      boolean | undefined;
  isReleased:    boolean | undefined;
  approvalCount: bigint  | undefined;
  documentHash:  string  | undefined;
  isCancelled:   boolean | undefined;
}

interface PendingDealItem {
  id: string;               // deal_code_id
  dbId: string;             // DB UUID — needed for accept/reject/deploy
  clientAddress: string;
  freelancerAddress: string;
  amount: string;
  title: string;
  deliverables: string;
  deadline: string;
  documentHash: string;
  formData: any;
  status: string;
  arbiterAccepted: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BLANK_LEDGER: LedgerDone = { registered: false, depositRecorded: false, disbursementRecorded: false, closed: false };

export default function ArbiterPage() {
  const { address, isConnected } = useAccount();

  // ── Write hooks ───────────────────────────────────────────────────────────────

  const {
    writeContract: writeFactory,
    isPending: isFactoryPending,
    isError: isFactoryError,
    data: factoryTxHash,
  } = useWriteContract();

  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
    data: escrowTxHash,
  } = useWriteContract();

  const {
    writeContract: writeLedger,
    isPending: isLedgerPending,
    isError: isLedgerError,
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

  // ── Active escrow + current DB deal ──────────────────────────────────────────

  const [deployedEscrowAddress, setDeployedEscrowAddress] = useState<`0x${string}` | null>(null);
  const [currentDealId, setCurrentDealId] = useState<string | null>(null);

  const caseId = deployedEscrowAddress ? keccak256(deployedEscrowAddress) : null;

  // ── CPRA ledger step tracking (persisted in DB) ───────────────────────────────

  const [currentLedgerStep, setCurrentLedgerStep] = useState<LedgerStep | null>(null);
  const [ledgerDone, setLedgerDone] = useState<LedgerDone>(BLANK_LEDGER);

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
    { address: addr, abi: ESCROW_ABI, functionName: 'documentHash' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isCancelled' },
  ]);

  const { data: allCasesData, refetch: refetchAllCases } = useReadContracts({
    contracts: allCasesReads as any,
    query: { enabled: allEscrows.length > 0 && !!address },
  });

  const myCases: MyCaseItem[] = allEscrows
    .map((addr, i) => {
      const base = i * 9;
      return {
        address: addr,
        lawyer:           allCasesData?.[base + 0]?.result as `0x${string}` | undefined,
        buyer:            allCasesData?.[base + 1]?.result as `0x${string}` | undefined,
        seller:           allCasesData?.[base + 2]?.result as `0x${string}` | undefined,
        settlementAmount: allCasesData?.[base + 3]?.result as bigint | undefined,
        isFunded:         allCasesData?.[base + 4]?.result as boolean | undefined,
        isReleased:       allCasesData?.[base + 5]?.result as boolean | undefined,
        approvalCount:    allCasesData?.[base + 6]?.result as bigint | undefined,
        documentHash:     allCasesData?.[base + 7]?.result as string | undefined,
        isCancelled:      allCasesData?.[base + 8]?.result as boolean | undefined,
      };
    })
    .filter((c) => c.lawyer?.toLowerCase() === address?.toLowerCase());

  // ── Case agreements — fetched from DB by document hash ───────────────────────

  const [expandedAgreements, setExpandedAgreements] = useState<Set<string>>(new Set());
  const [caseDealInfo, setCaseDealInfo] = useState<Record<string, { formData: any; dealId: string }>>({});

  useEffect(() => {
    console.log('[caseDealInfo] Effect running for', myCases.length, 'cases');
    myCases.forEach(c => {
      if (caseDealInfo[c.address]) {
        console.log('[caseDealInfo] Already loaded:', c.address);
        return;
      }
      console.log('[caseDealInfo] Fetching by-escrow for:', c.address);
      fetch(`/api/deals/by-escrow/${c.address}`)
        .then(r => r.json())
        .then(({ deal }) => {
          if (deal?.form_data) {
            console.log('[caseDealInfo] by-escrow SUCCESS for', c.address, 'dealId:', deal.id);
            setCaseDealInfo(prev => ({ ...prev, [c.address]: { formData: deal.form_data, dealId: deal.id } }));
          } else if (c.documentHash) {
            console.log('[caseDealInfo] by-escrow returned no deal, trying by-hash:', c.documentHash);
            fetch(`/api/deals/by-hash/${c.documentHash}`)
              .then(r => r.json())
              .then(({ deal: d2 }) => {
                if (d2?.form_data) {
                  console.log('[caseDealInfo] by-hash SUCCESS for', c.address, 'dealId:', d2.id);
                  setCaseDealInfo(prev => ({ ...prev, [c.address]: { formData: d2.form_data, dealId: d2.id } }));
                } else {
                  console.log('[caseDealInfo] by-hash returned no deal for', c.documentHash);
                }
              })
              .catch((e) => { console.log('[caseDealInfo] by-hash FAILED:', e); });
          } else {
            console.log('[caseDealInfo] No deal and no documentHash for', c.address);
          }
        })
        .catch((e) => { console.log('[caseDealInfo] by-escrow FAILED:', e); });
    });
  }, [JSON.stringify(myCases.map(c => c.address))]);

  // ── CPRA status for completed/cancelled cases (list view) ─────────────────────

  const [casesCpraStatus, setCasesCpraStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const completed = myCases.filter(c => c.isReleased || c.isCancelled).map(c => c.address);
    completed.forEach(addr => {
      fetch(`/api/ledger/${addr}`)
        .then(r => r.json())
        .then(({ progress }) => {
          setCasesCpraStatus(prev => ({ ...prev, [addr]: progress?.closed ?? false }));
        })
        .catch(() => {});
    });
  }, [myCases.length]);

  // ── Load a case from on-chain history ─────────────────────────────────────────

  const loadCase = (c: MyCaseItem) => {
    setDeployedEscrowAddress(c.address);
    setBuyerAddress(c.buyer ?? '');
    setSellerAddress(c.seller ?? '');
    setSettlementAmount(c.settlementAmount !== undefined ? formatEther(c.settlementAmount) : '');
    setCurrentLedgerStep(null);
    setLedgerDone(BLANK_LEDGER);
  };

  // Auto-fetch CPRA progress from DB whenever a case address is set
  useEffect(() => {
    if (!deployedEscrowAddress) return;
    fetch(`/api/ledger/${deployedEscrowAddress}`)
      .then(r => r.json())
      .then(({ progress }) => {
        if (progress) {
          setLedgerDone({
            registered:           progress.registered            ?? false,
            depositRecorded:      progress.deposit_recorded      ?? false,
            disbursementRecorded: progress.disbursement_recorded ?? false,
            closed:               progress.closed                ?? false,
          });
        }
      })
      .catch(() => {});
  }, [deployedEscrowAddress]);

  // ── Parse EscrowCreated log when factory receipt arrives ─────────────────────

  useEffect(() => {
    if (!factoryReceipt) return;
    const logs = parseEventLogs({ abi: FACTORY_ABI, eventName: 'EscrowCreated', logs: factoryReceipt.logs });
    if (logs.length > 0) {
      const escrowAddr = (logs[0] as any).args.escrowAddress as `0x${string}`;
      setDeployedEscrowAddress(escrowAddr);
      setLedgerDone(BLANK_LEDGER);
      refetchAllEscrows();
      refetchAllCases();
      showToast('Contract deployed successfully');

      // Persist escrow address to DB, then refresh pending queue
      if (currentDealId) {
        (async () => {
          await fetch(`/api/deals/${currentDealId}/deploy`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ escrow_address: escrowAddr, arbiter_address: address }),
          }).catch(() => {});
          fetchPendingDeals();
        })();
      }
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

  const { data: isCancelledRaw,               refetch: refetchCancelled      } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'isCancelled',
    query: { enabled: !!deployedEscrowAddress },
  });
  const isCancelled = isCancelledRaw as boolean | undefined;

  const { data: cancelApprovalCountRaw,       refetch: refetchCancelApprovals } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'cancelApprovalCount',
    query: { enabled: !!deployedEscrowAddress },
  });
  const cancelApprovalCount = cancelApprovalCountRaw as bigint | undefined;

  const { data: hasCurrentWalletCancelApprovedRaw, refetch: refetchCancelApproved } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'hasCancelApproved',
    args: address ? [address] : undefined,
    query: { enabled: !!deployedEscrowAddress && !!address },
  });
  const hasCurrentWalletCancelApproved = hasCurrentWalletCancelApprovedRaw as boolean | undefined;

  // ── Network guard ─────────────────────────────────────────────────────────────

  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const ALLOWED_CHAINS = [31337, 11155111, 420420417];
  const isWrongNetwork = isConnected && !ALLOWED_CHAINS.includes(chainId);

  // ── Toast system ──────────────────────────────────────────────────────────────

  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback((message: string, type: ToastEntry['type'] = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  useEffect(() => { if (isFactoryError) showToast('Deploy transaction failed', 'error'); }, [isFactoryError]);
  useEffect(() => { if (isEscrowError)  showToast('Transaction failed', 'error');         }, [isEscrowError]);
  useEffect(() => { if (isLedgerError)  showToast('Ledger write failed', 'error');        }, [isLedgerError]);

  // ── Refetch escrow state after escrow tx ─────────────────────────────────────

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchFunded(); refetchApprovals(); refetchReleased(); refetchApproved();
    refetchCancelled(); refetchCancelApprovals(); refetchCancelApproved();
    refetchAllCases();
    showToast('Transaction confirmed');
  }, [isEscrowTxConfirmed]);

  // ── Advance ledger step tracking after each ledger tx ────────────────────────

  useEffect(() => {
    if (!isLedgerTxConfirmed || !currentLedgerStep || !deployedEscrowAddress) return;

    const next: LedgerDone = {
      registered:           ledgerDone.registered           || currentLedgerStep === 'register',
      depositRecorded:      ledgerDone.depositRecorded       || currentLedgerStep === 'deposit',
      disbursementRecorded: ledgerDone.disbursementRecorded  || currentLedgerStep === 'disburse' || currentLedgerStep === 'finalize',
      closed:               ledgerDone.closed                || currentLedgerStep === 'close'    || currentLedgerStep === 'finalize' || currentLedgerStep === 'cancel-close',
    };
    setLedgerDone(next);
    showToast('Ledger entry recorded');

    // Persist to DB
    fetch(`/api/ledger/${deployedEscrowAddress}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arbiter_address:       address,
        registered:            next.registered,
        deposit_recorded:      next.depositRecorded,
        disbursement_recorded: next.disbursementRecorded,
        closed:                next.closed,
      }),
    }).catch(() => {});
  }, [isLedgerTxConfirmed]);

  // ── Pending deals — fetched from DB ──────────────────────────────────────────

  const [allPendingDeals, setAllPendingDeals] = useState<PendingDealItem[]>([]);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);
  const [acceptingDealId, setAcceptingDealId] = useState<string | null>(null);
  const [rejectingDealId, setRejectingDealId] = useState<string | null>(null);

  const pendingAcceptanceDeals = allPendingDeals.filter(d => d.status === 'pending_acceptance');
  const readyToDeployDeals     = allPendingDeals.filter(d => d.status === 'accepted');

  const fetchPendingDeals = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`/api/deals?wallet_address=${address}`);
      const { deals } = await r.json();
      if (!Array.isArray(deals)) return;
      const items: PendingDealItem[] = deals
        .filter((d: any) => !d.escrow_address)
        .map((d: any) => ({
          id:                d.deal_code_id,
          dbId:              d.id,
          clientAddress:     d.client_address,
          freelancerAddress: d.freelancer_address,
          amount:            d.form_data?.amount ?? '',
          title:             d.form_data?.title ?? '',
          deliverables:      d.form_data?.deliverables ?? '',
          deadline:          d.form_data?.deadline ?? '',
          documentHash:      d.document_hash,
          formData:          d.form_data,
          status:            d.status,
          arbiterAccepted:   d.arbiter_accepted ?? false,
        }));
      setAllPendingDeals(items);
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) fetchPendingDeals();
  }, [isConnected, address, fetchPendingDeals]);

  const handleAcceptDeal = async (deal: PendingDealItem) => {
    if (!address) return;
    setAcceptingDealId(deal.dbId);
    try {
      const r = await fetch(`/api/deals/${deal.dbId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Could not accept deal', 'error'); return; }
      showToast('Deal accepted');
      fetchPendingDeals();
    } catch {
      showToast('Could not accept deal', 'error');
    } finally {
      setAcceptingDealId(null);
    }
  };

  const handleRejectDeal = async (deal: PendingDealItem) => {
    if (!address) return;
    setRejectingDealId(deal.dbId);
    try {
      const r = await fetch(`/api/deals/${deal.dbId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.error || 'Could not reject deal', 'error'); return; }
      showToast('Deal rejected');
      fetchPendingDeals();
    } catch {
      showToast('Could not reject deal', 'error');
    } finally {
      setRejectingDealId(null);
    }
  };

  const prefillFromDeal = (deal: PendingDealItem) => {
    setBuyerAddress(deal.clientAddress);
    setSellerAddress(deal.freelancerAddress);
    setSettlementAmount(deal.amount);
    setCasePurpose(deal.title);
    setDocumentHash(deal.documentHash);
    setCurrentDealId(deal.dbId);
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

  const handleApproveCancellation = () => {
    if (!deployedEscrowAddress) return;
    writeEscrow({ address: deployedEscrowAddress, abi: ESCROW_ABI, functionName: 'approveCancellation' });
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

  const handleFinalizeCase = () => {
    if (!caseId) return;
    setCurrentLedgerStep('finalize');
    writeLedger({ address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'finalizeCase', args: [caseId, parseEther(settlementAmount)] });
  };

  const handleCloseCancelledCase = () => {
    if (!caseId) return;
    setCurrentLedgerStep('cancel-close');
    writeLedger({ address: LEDGER_ADDRESS, abi: LEDGER_ABI, functionName: 'closeCancelledCase', args: [caseId] });
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
            <p className="text-slate-500 mb-4">Review and accept deals, deploy escrow contracts, and manage CPRA compliance.</p>
            <div className="flex justify-center mb-4"><ConnectButton /></div>
            <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors">
              View Global Case Ledger →
            </Link>
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
                          <div className="flex flex-col items-end gap-1">
                            {c.isCancelled ? (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">Cancelled</span>
                            ) : c.isReleased ? (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-semibold">Released</span>
                            ) : c.isFunded ? (
                              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">Funded</span>
                            ) : (
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Awaiting Funding</span>
                            )}
                            {(c.isReleased || c.isCancelled) && <CpraBadge closed={casesCpraStatus[c.address]} />}
                          </div>
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

                      {/* View Agreement (from DB) */}
                      {caseDealInfo[c.address] && (() => {
                        const { formData, dealId } = caseDealInfo[c.address];
                        const isExpanded = expandedAgreements.has(c.address);
                        return (
                          <div className="mt-3 pt-3 border-t border-slate-200">
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
                              formData?.type === 'file' ? (
                                <div className="mt-2 bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 space-y-2">
                                  <p className="font-semibold text-slate-800">{formData.filename}</p>
                                  <p className="text-slate-500">Document hash (on-chain proof):</p>
                                  <p className="font-mono text-slate-600 break-all">{c.documentHash}</p>
                                  {address && <ViewDocumentButton dealId={dealId} walletAddress={address} />}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-slate-400">No preview available.</p>
                              )
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Acceptance Queue */}
          {isConnected && (
            <div className="mb-8 p-6 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-amber-800">Pending Acceptance</h2>
                <button
                  onClick={fetchPendingDeals}
                  className="text-xs text-amber-600 hover:text-amber-900 border border-amber-200 px-3 py-1 rounded transition-colors"
                >
                  Refresh
                </button>
              </div>
              <p className="text-xs text-amber-700 mb-4">
                Deals created by Clients that require your acceptance before deployment.
              </p>

              {pendingAcceptanceDeals.length === 0 ? (
                <p className="text-sm text-amber-600">No deals awaiting your acceptance.</p>
              ) : (
                <div className="space-y-3">
                  {pendingAcceptanceDeals.map((deal) => (
                    <div key={deal.dbId} className="bg-white rounded-md border border-amber-200 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{deal.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {deal.amount} PAS · Client: <span className="font-mono">{deal.clientAddress?.slice(0, 10)}…</span>
                          </p>
                          {deal.deadline && (
                            <p className="text-xs text-slate-400 mt-0.5">Deadline: {deal.deadline}</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setExpandedDeal(expandedDeal === deal.dbId ? null : deal.dbId)}
                            className="text-xs text-amber-700 hover:text-amber-900 border border-amber-200 px-2 py-1 rounded transition-colors"
                          >
                            {expandedDeal === deal.dbId ? 'Collapse' : 'Review'}
                          </button>
                          {!deal.arbiterAccepted && (
                            <>
                              <button
                                onClick={() => handleRejectDeal(deal)}
                                disabled={rejectingDealId === deal.dbId || acceptingDealId === deal.dbId}
                                className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                {rejectingDealId === deal.dbId ? 'Rejecting…' : 'Reject'}
                              </button>
                              <button
                                onClick={() => handleAcceptDeal(deal)}
                                disabled={acceptingDealId === deal.dbId || rejectingDealId === deal.dbId}
                                className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:bg-slate-400"
                              >
                                {acceptingDealId === deal.dbId ? 'Accepting…' : 'Accept'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {deal.arbiterAccepted && (
                        <div className="mt-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium">
                          You have accepted. Waiting for Freelancer.
                        </div>
                      )}

                      {expandedDeal === deal.dbId && (
                        <div className="mt-3 pt-3 border-t border-amber-100 space-y-2">
                          <div className="text-xs space-y-1.5">
                            <div><span className="text-slate-500">Client:</span> <span className="font-mono text-slate-700 break-all">{deal.clientAddress}</span></div>
                            <div><span className="text-slate-500">Freelancer:</span> <span className="font-mono text-slate-700 break-all">{deal.freelancerAddress}</span></div>
                            <div><span className="text-slate-500">Amount:</span> <span className="font-semibold text-slate-700">{deal.amount} PAS</span></div>
                            {deal.deadline && <div><span className="text-slate-500">Deadline:</span> <span className="text-slate-700">{deal.deadline}</span></div>}
                            {deal.deliverables && (
                              <div>
                                <span className="text-slate-500">Deliverables:</span>
                                <p className="mt-1 text-slate-700 bg-slate-50 rounded p-2 whitespace-pre-wrap">{deal.deliverables}</p>
                              </div>
                            )}
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

          {/* Ready to Deploy Queue */}
          {isConnected && readyToDeployDeals.length > 0 && (
            <div className="mb-8 p-6 bg-indigo-50 rounded-lg border border-indigo-200">
              <h2 className="text-lg font-semibold mb-3 text-indigo-800">Ready to Deploy</h2>
              <p className="text-xs text-indigo-600 mb-4">
                Both parties have accepted. Click Deploy to pre-fill the form below and deploy the escrow contract.
              </p>
              <div className="space-y-3">
                {readyToDeployDeals.map((deal) => (
                  <div key={deal.dbId} className="bg-white rounded-md border border-indigo-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{deal.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {deal.amount} PAS · Client: <span className="font-mono">{deal.clientAddress?.slice(0, 10)}…</span>
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setExpandedDeal(expandedDeal === deal.dbId ? null : deal.dbId)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-2 py-1 rounded transition-colors"
                        >
                          {expandedDeal === deal.dbId ? 'Collapse' : 'Review'}
                        </button>
                        <button
                          onClick={() => { prefillFromDeal(deal); setExpandedDeal(null); }}
                          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition-colors"
                        >
                          Deploy
                        </button>
                      </div>
                    </div>

                    {expandedDeal === deal.dbId && (
                      <div className="mt-3 pt-3 border-t border-indigo-100 space-y-2">
                        <div className="text-xs space-y-1.5">
                          <div><span className="text-slate-500">Client:</span> <span className="font-mono text-slate-700 break-all">{deal.clientAddress}</span></div>
                          <div><span className="text-slate-500">Freelancer:</span> <span className="font-mono text-slate-700 break-all">{deal.freelancerAddress}</span></div>
                          <div><span className="text-slate-500">Amount:</span> <span className="font-semibold text-slate-700">{deal.amount} PAS</span></div>
                          {deal.deadline && <div><span className="text-slate-500">Deadline:</span> <span className="text-slate-700">{deal.deadline}</span></div>}
                          {deal.deliverables && (
                            <div>
                              <span className="text-slate-500">Deliverables:</span>
                              <p className="mt-1 text-slate-700 bg-slate-50 rounded p-2 whitespace-pre-wrap">{deal.deliverables}</p>
                            </div>
                          )}
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
            </div>
          )}

          {/* Step 1: Document Hash */}
          <div className="mt-4 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">1. Document Hash</h2>
            <p className="text-sm text-slate-500 mb-3">
              Pre-filled from a ready deal, or enter a hash manually.
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
                    <p className="font-semibold">Transaction failed. Please try again.</p>
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
                  This wallet has already approved release.
                </div>
              ) : hasCurrentWalletCancelApproved ? (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-200 text-sm font-medium">
                  This wallet approved cancellation — cannot also approve release.
                </div>
              ) : (
                <button onClick={handleApprove} disabled={isEscrowPending}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400">
                  {isEscrowPending ? 'Confirming in Wallet...' : 'Approve Release'}
                </button>
              )}
              {isEscrowError && (
                <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs">
                  Transaction failed. Please try again.
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

          {/* Deal Cancelled */}
          {deployedEscrowAddress && isCancelled && (
            <div className="mt-8 p-6 bg-red-50 rounded-lg border border-red-300 text-center">
              <h2 className="text-2xl font-bold text-red-800 mb-2">Deal Cancelled</h2>
              <p className="text-sm text-red-700">2-of-3 parties approved cancellation. Funds have been refunded to the Client.</p>
              <p className="text-xs font-mono text-red-600 mt-3 break-all">Escrow: {deployedEscrowAddress}</p>
            </div>
          )}

          {/* Approve Cancellation */}
          {deployedEscrowAddress && isConnected && isFunded && !isReleased && !isCancelled && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">Approve Cancellation</h2>
              <p className="text-sm text-slate-500 mb-4">
                If the deal needs to be cancelled, 2-of-3 parties must approve. Funds are refunded to the Client automatically.
              </p>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm font-medium text-slate-600">Cancel approvals:</span>
                <span className="text-2xl font-bold text-slate-800">{String(cancelApprovalCount ?? 0)}</span>
                <span className="text-slate-400 text-lg">/</span>
                <span className="text-2xl font-bold text-slate-400">3</span>
                <div className="flex gap-2 ml-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`w-5 h-5 rounded-full border-2 ${
                      i < Number(cancelApprovalCount ?? 0) ? 'bg-red-500 border-red-600' : 'bg-slate-200 border-slate-300'
                    }`} />
                  ))}
                </div>
              </div>
              {hasCurrentWalletCancelApproved ? (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-md border border-amber-200 text-sm font-medium">
                  This wallet has approved cancellation. Waiting for another party.
                </div>
              ) : hasCurrentWalletApproved ? (
                <div className="p-3 bg-green-50 text-green-800 rounded-md border border-green-200 text-sm font-medium">
                  This wallet approved release — cannot also approve cancellation.
                </div>
              ) : (
                <button onClick={handleApproveCancellation} disabled={isEscrowPending}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400">
                  {isEscrowPending ? 'Confirming in Wallet...' : 'Approve Cancellation'}
                </button>
              )}
            </div>
          )}

          {/* CPRA Ledger */}
          {deployedEscrowAddress && isConnected && (
            <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
              <h2 className="text-xl font-semibold mb-1 text-slate-700">CPRA Compliance Ledger</h2>
              <p className="text-sm text-slate-500 mb-4">
                Record each phase of the settlement to the on-chain audit trail.
              </p>

              {!isReleased && !isCancelled ? (
                <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500 text-center">
                  Awaiting deal outcome. CPRA recording will unlock once the deal is released or cancelled.
                </div>
              ) : isReleased ? (
                <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                  <LedgerStepRow
                    label="1. Register Case"
                    available={!!isReleased}
                    done={ledgerDone.registered}
                    onAction={handleRegisterCase}
                    disabled={isLedgerPending}
                  />
                  <LedgerStepRow
                    label="2. Record Deposit"
                    available={!!isReleased && ledgerDone.registered}
                    done={ledgerDone.depositRecorded}
                    onAction={handleRecordDeposit}
                    disabled={isLedgerPending}
                  />
                  <LedgerStepRow
                    label="3. Finalize Case (Disburse + Close)"
                    available={!!isReleased && ledgerDone.registered && ledgerDone.depositRecorded}
                    done={ledgerDone.disbursementRecorded && ledgerDone.closed}
                    onAction={handleFinalizeCase}
                    disabled={isLedgerPending}
                  />
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                  <LedgerStepRow
                    label="1. Register Case"
                    available={!!isCancelled}
                    done={ledgerDone.registered}
                    onAction={handleRegisterCase}
                    disabled={isLedgerPending}
                  />
                  <LedgerStepRow
                    label="2. Close Cancelled Case"
                    available={!!isCancelled && ledgerDone.registered}
                    done={ledgerDone.closed}
                    onAction={handleCloseCancelledCase}
                    disabled={isLedgerPending}
                  />
                </div>
              )}

              {isLedgerError && (
                <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs">
                  Transaction failed. Please try again.
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
