'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { keccak256 } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';

// Truncate a keccak256 hash for anonymous display
function truncHash(h: string): string {
  return h.slice(0, 10) + '…' + h.slice(-8);
}

function StatusBadge({ isFunded, isReleased, isCancelled }: {
  isFunded: boolean | undefined;
  isReleased: boolean | undefined;
  isCancelled: boolean | undefined;
}) {
  if (isCancelled)
    return <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded">Cancelled</span>;
  if (isReleased)
    return <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">Released</span>;
  if (isFunded)
    return <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">Funded</span>;
  return <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">Awaiting Funding</span>;
}

function CpraBadge({ closed }: { closed: boolean | undefined }) {
  if (closed === undefined) return null;
  return closed
    ? <span className="text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-1 rounded">CPRA Filed</span>
    : <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">CPRA Pending</span>;
}

export default function Dashboard() {
  // ── Read all deployed escrow addresses (no wallet required) ──────────────────

  const {
    data: escrowsRaw,
    isLoading,
    refetch,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getDeployedEscrows',
  });

  const escrows = (escrowsRaw ?? []) as `0x${string}`[];

  // ── Batch read: isFunded + isReleased (2 reads × N) ──────────────────────────

  const contractReads = escrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isCancelled' },
  ]);

  const { data: stateData } = useReadContracts({
    contracts: contractReads as any,
    query: { enabled: escrows.length > 0 },
  });

  // ── caseId = keccak256(escrowAddr) — no party data exposed ───────────────────

  const cases = escrows.map((addr, i) => {
    const base = i * 3;
    return {
      address: addr,
      caseId:      keccak256(addr),
      isFunded:    stateData?.[base + 0]?.result as boolean | undefined,
      isReleased:  stateData?.[base + 1]?.result as boolean | undefined,
      isCancelled: stateData?.[base + 2]?.result as boolean | undefined,
    };
  });

  // ── CPRA status for completed/cancelled cases ─────────────────────────────────

  const [ledgerClosed, setLedgerClosed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const completed = cases.filter(c => c.isReleased || c.isCancelled).map(c => c.address);
    completed.forEach(addr => {
      fetch(`/api/ledger/${addr}`)
        .then(r => r.json())
        .then(({ progress }) => {
          setLedgerClosed(prev => ({ ...prev, [addr]: progress?.closed ?? false }));
        })
        .catch(() => {});
    });
  }, [cases.length]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-3xl w-full border border-slate-200">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Global Case Ledger</h1>
            <p className="text-sm text-slate-500 mt-1">
              All settlement cases on this platform. Case IDs are anonymised — no party details are shown.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md transition-colors flex-shrink-0"
          >
            ← Back
          </Link>
        </div>

        <hr className="border-slate-200 mb-6" />

        {/* Loading */}
        {isLoading && (
          <p className="text-sm text-slate-500 py-4">Loading cases...</p>
        )}

        {/* Empty state */}
        {!isLoading && escrows.length === 0 && (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-md text-center">
            <p className="text-sm text-slate-600">No cases deployed yet.</p>
          </div>
        )}

        {/* Case list */}
        {cases.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-600">
                {cases.length} case{cases.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => refetch()}
                className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded transition-colors"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-3">
              {cases.map((c) => (
                <div
                  key={c.address}
                  className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">
                      Case ID
                    </p>
                    <p className="text-xs font-mono text-slate-700">{truncHash(c.caseId)}</p>
                  </div>
                  {c.isFunded !== undefined && c.isReleased !== undefined && (
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <StatusBadge isFunded={c.isFunded} isReleased={c.isReleased} isCancelled={c.isCancelled} />
                      {(c.isReleased || c.isCancelled) && <CpraBadge closed={ledgerClosed[c.address]} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
