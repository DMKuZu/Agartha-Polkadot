'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RicardianUploader } from '../components/RicardianUploader';
import { useState, useEffect } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseEther, isAddress, parseEventLogs, keccak256 } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI, LEDGER_ADDRESS, LEDGER_ABI } from '../contracts/abis';

export default function Home() {
  const { address, isConnected } = useAccount();

  // ── Write hooks ──────────────────────────────────────────────────────────────

  // Factory: createCase
  const {
    writeContract: writeFactory,
    isPending: isFactoryPending,
    isError: isFactoryError,
    error: factoryError,
    data: factoryTxHash,
  } = useWriteContract();

  // Escrow: fund + approveRelease
  const {
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    isError: isEscrowError,
    error: escrowError,
    data: escrowTxHash,
  } = useWriteContract();

  // Ledger: registerCase, recordDeposit, recordDisbursement, closeCase
  const {
    writeContract: writeLedger,
    isPending: isLedgerPending,
    isError: isLedgerError,
    error: ledgerError,
    data: ledgerTxHash,
  } = useWriteContract();

  // ── Receipt watchers ─────────────────────────────────────────────────────────

  const { data: factoryReceipt } = useWaitForTransactionReceipt({ hash: factoryTxHash });
  const { isSuccess: isEscrowTxConfirmed }  = useWaitForTransactionReceipt({ hash: escrowTxHash });
  const { isSuccess: isLedgerTxConfirmed }  = useWaitForTransactionReceipt({ hash: ledgerTxHash });

  // ── Form state ───────────────────────────────────────────────────────────────

  const [documentHash,    setDocumentHash]    = useState<string>('');
  const [buyerAddress,    setBuyerAddress]    = useState<string>('');
  const [sellerAddress,   setSellerAddress]   = useState<string>('');
  const [settlementAmount,setSettlementAmount]= useState<string>('');
  const [casePurpose,     setCasePurpose]     = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  // ── Derived contract state ───────────────────────────────────────────────────

  const [deployedEscrowAddress, setDeployedEscrowAddress] = useState<`0x${string}` | null>(null);

  // Deterministic caseId for the ledger — keccak256 of the escrow address
  const caseId = deployedEscrowAddress ? keccak256(deployedEscrowAddress) : null;

  // ── CPRA ledger step tracking (local — persists for this session) ────────────

  type LedgerStep = 'register' | 'deposit' | 'disburse' | 'close';
  const [currentLedgerStep, setCurrentLedgerStep] = useState<LedgerStep | null>(null);
  const [ledgerDone, setLedgerDone] = useState({
    registered:          false,
    depositRecorded:     false,
    disbursementRecorded:false,
    closed:              false,
  });

  // ── Parse EscrowCreated log when factory receipt arrives ─────────────────────

  useEffect(() => {
    if (!factoryReceipt) return;
    const logs = parseEventLogs({ abi: FACTORY_ABI, eventName: 'EscrowCreated', logs: factoryReceipt.logs });
    if (logs.length > 0) {
      const escrowAddr = (logs[0] as any).args.escrowAddress as `0x${string}`;
      setDeployedEscrowAddress(escrowAddr);
    }
  }, [factoryReceipt]);

  // ── Read escrow state ────────────────────────────────────────────────────────

  const { data: isFundedRaw,                refetch: refetchFunded    } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'isFunded',
    query: { enabled: !!deployedEscrowAddress },
  });
  const isFunded = isFundedRaw as boolean | undefined;

  const { data: approvalCountRaw,           refetch: refetchApprovals } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'approvalCount',
    query: { enabled: !!deployedEscrowAddress },
  });
  const approvalCount = approvalCountRaw as bigint | undefined;

  const { data: isReleasedRaw,              refetch: refetchReleased  } = useReadContract({
    address: deployedEscrowAddress ?? undefined, abi: ESCROW_ABI, functionName: 'isReleased',
    query: { enabled: !!deployedEscrowAddress },
  });
  const isReleased = isReleasedRaw as boolean | undefined;

  const { data: hasCurrentWalletApprovedRaw,refetch: refetchApproved  } = useReadContract({
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

  // ── Refetch escrow state after escrow tx ─────────────────────────────────────

  useEffect(() => {
    if (!isEscrowTxConfirmed) return;
    refetchFunded(); refetchApprovals(); refetchReleased(); refetchApproved();
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
  }, [isLedgerTxConfirmed]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDeployContract = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    if (!documentHash)    return setValidationError('Please upload and hash a document first.');
    if (!buyerAddress || !sellerAddress || !settlementAmount)
                          return setValidationError('Please fill in all fields.');
    if (!isAddress(buyerAddress))  return setValidationError('Buyer address is not a valid Ethereum address.');
    if (!isAddress(sellerAddress)) return setValidationError('Seller address is not a valid Ethereum address.');
    if (buyerAddress.toLowerCase() === sellerAddress.toLowerCase())
                          return setValidationError('Buyer and seller cannot be the same address.');
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

  const handleFund = () => {
    if (!deployedEscrowAddress || !settlementAmount) return;
    writeEscrow({ address: deployedEscrowAddress, abi: ESCROW_ABI, functionName: 'fund', value: parseEther(settlementAmount) });
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
    <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
      <div className="bg-white p-10 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-3 text-slate-800">Legal Escrow Dashboard</h1>
          <p className="text-slate-500 mb-8">Secure, automated, and CPRA-compliant settlement architecture.</p>
          <div className="flex justify-center mb-8"><ConnectButton /></div>
        </div>

        <hr className="border-slate-200 mb-8" />

        {/* Step 1: Upload PDF */}
        <RicardianUploader onHashGenerated={setDocumentHash} />

        {/* Step 2: Deploy Contract */}
        {isConnected && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">2. Deploy Settlement Contract</h2>
            <p className="text-sm text-slate-500 mb-4">
              Your connected wallet{' '}
              <span className="font-mono font-semibold text-slate-700">{address}</span>{' '}
              will be recorded as the <strong>lawyer</strong>.
            </p>

            <form onSubmit={handleDeployContract} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Wallet Address</label>
                <input type="text" placeholder="0x..."
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                  value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value.trim())} />
                {buyerAddress && !isAddress(buyerAddress) && <p className="text-xs text-red-500 mt-1">Invalid address format.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Seller Wallet Address</label>
                <input type="text" placeholder="0x..."
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black font-mono text-sm"
                  value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value.trim())} />
                {sellerAddress && !isAddress(sellerAddress) && <p className="text-xs text-red-500 mt-1">Invalid address format.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Settlement Amount (ETH)</label>
                <input type="number" step="0.01" min="0" placeholder="e.g. 1.5"
                  className="w-full p-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Case Purpose / Description</label>
                <input type="text" placeholder="e.g. Property settlement — Cruz vs. Reyes"
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
                  <p className="font-semibold">Contract deployed successfully.</p>
                  <p className="text-xs mt-1 text-green-700">Escrow Address:</p>
                  <p className="text-xs break-all font-mono mt-1">{deployedEscrowAddress}</p>
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

        {/* Step 3: Fund Escrow */}
        {deployedEscrowAddress && isConnected && !isFunded && !isReleased && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">3. Fund Escrow</h2>
            <p className="text-sm text-slate-500 mb-1">
              Switch MetaMask to the <strong>buyer</strong> account, then deposit the settlement amount.
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Buyer: <span className="font-mono text-slate-700">{buyerAddress}</span>
            </p>
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              Amount to deposit: <strong>{settlementAmount} ETH</strong>
            </div>
            <button onClick={handleFund} disabled={isEscrowPending}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-md transition-colors disabled:bg-slate-400">
              {isEscrowPending ? 'Confirming in Wallet...' : `Deposit ${settlementAmount} ETH`}
            </button>
            {isEscrowError && (
              <div className="mt-3 p-3 bg-red-100 text-red-800 rounded-md border border-red-300 text-xs font-mono break-all">
                {escrowError?.message}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Approve Release */}
        {deployedEscrowAddress && isConnected && isFunded && !isReleased && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">4. Approve Release</h2>
            <p className="text-sm text-slate-500 mb-4">
              Each party (buyer, seller, lawyer) must connect their wallet and approve. Funds release automatically at 2 of 3.
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

        {/* Step 5: Settlement Complete */}
        {deployedEscrowAddress && isReleased && (
          <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-300 text-center">
            <h2 className="text-2xl font-bold text-green-800 mb-2">Settlement Complete</h2>
            <p className="text-sm text-green-700">Funds have been released to the seller.</p>
            <p className="text-xs font-mono text-green-600 mt-3 break-all">Escrow: {deployedEscrowAddress}</p>
          </div>
        )}

        {/* Step 6: CPRA Ledger */}
        {deployedEscrowAddress && isConnected && (
          <div className="mt-8 p-6 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="text-xl font-semibold mb-1 text-slate-700">6. CPRA Compliance Ledger</h2>
            <p className="text-sm text-slate-500 mb-4">
              Record each phase of the settlement to the on-chain audit trail. Requires the <strong>law firm admin</strong> wallet.
            </p>

            {/* Admin check */}
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

            {/* Ledger steps */}
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
    </main>
  );
}
