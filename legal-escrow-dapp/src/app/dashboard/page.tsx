'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { FACTORY_ADDRESS, FACTORY_ABI, ESCROW_ABI } from '../../contracts/abis';

function StatusBadge({
  isFunded,
  isReleased,
  approvalCount,
}: {
  isFunded: boolean;
  isReleased: boolean;
  approvalCount: bigint;
}) {
  if (isReleased)
    return (
      <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded">
        Released
      </span>
    );
  if (isFunded)
    return (
      <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-1 rounded">
        Funded — {String(approvalCount)}/3 approvals
      </span>
    );
  return (
    <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">
      Awaiting Funding
    </span>
  );
}

export default function Dashboard() {
  const { isConnected } = useAccount();

  // ── Read all deployed escrow addresses ──────────────────────────────────────

  const {
    data: escrowsRaw,
    isLoading: isLoadingEscrows,
    refetch,
  } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getDeployedEscrows',
  });

  const escrows = (escrowsRaw ?? []) as `0x${string}`[];

  // ── Batch read state for every escrow (6 reads × N escrows) ─────────────────

  const contractReads = escrows.flatMap((addr) => [
    { address: addr, abi: ESCROW_ABI, functionName: 'buyer' },
    { address: addr, abi: ESCROW_ABI, functionName: 'seller' },
    { address: addr, abi: ESCROW_ABI, functionName: 'settlementAmount' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isFunded' },
    { address: addr, abi: ESCROW_ABI, functionName: 'isReleased' },
    { address: addr, abi: ESCROW_ABI, functionName: 'approvalCount' },
  ]);

  const { data: stateData } = useReadContracts({
    contracts: contractReads as any,
    query: { enabled: escrows.length > 0 },
  });

  // ── Group raw results into per-case objects ──────────────────────────────────

  const cases = escrows.map((addr, i) => {
    const base = i * 6;
    return {
      address: addr,
      buyer:            stateData?.[base + 0]?.result as `0x${string}` | undefined,
      seller:           stateData?.[base + 1]?.result as `0x${string}` | undefined,
      settlementAmount: stateData?.[base + 2]?.result as bigint | undefined,
      isFunded:         stateData?.[base + 3]?.result as boolean | undefined,
      isReleased:       stateData?.[base + 4]?.result as boolean | undefined,
      approvalCount:    stateData?.[base + 5]?.result as bigint | undefined,
    };
  });

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col items-center py-10 px-4 bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-5xl w-full border border-slate-200">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Lawyer Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              All cases deployed through this factory — live on-chain state.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-md transition-colors"
            >
              ← New Case
            </Link>
            <ConnectButton />
          </div>
        </div>

        <hr className="border-slate-200 mb-6" />

        {/* Not connected */}
        {!isConnected && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
            Connect your wallet to view case data.
          </div>
        )}

        {/* Loading */}
        {isConnected && isLoadingEscrows && (
          <p className="text-sm text-slate-500 py-4">Loading cases...</p>
        )}

        {/* Empty state */}
        {isConnected && !isLoadingEscrows && escrows.length === 0 && (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-md text-center">
            <p className="text-sm text-slate-600">No cases deployed yet.</p>
            <Link href="/" className="text-sm text-blue-600 hover:underline mt-1 inline-block">
              Deploy the first case →
            </Link>
          </div>
        )}

        {/* Case list */}
        {isConnected && cases.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-600">
                {cases.length} case{cases.length !== 1 ? 's' : ''} found
              </span>
              <button
                onClick={() => refetch()}
                className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded transition-colors"
              >
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {cases.map((c, i) => (
                <div key={c.address} className="border border-slate-200 rounded-lg p-5 bg-slate-50">

                  {/* Case header */}
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Case #{i + 1}
                      </span>
                      <p className="text-xs font-mono text-slate-600 break-all mt-0.5">
                        {c.address}
                      </p>
                    </div>
                    {c.isFunded !== undefined &&
                      c.isReleased !== undefined &&
                      c.approvalCount !== undefined && (
                        <StatusBadge
                          isFunded={c.isFunded}
                          isReleased={c.isReleased}
                          approvalCount={c.approvalCount}
                        />
                      )}
                  </div>

                  {/* Case fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Buyer</p>
                      <p className="font-mono text-slate-700 break-all text-xs">{c.buyer ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Seller</p>
                      <p className="font-mono text-slate-700 break-all text-xs">{c.seller ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Settlement Amount</p>
                      <p className="font-semibold text-slate-800">
                        {c.settlementAmount !== undefined
                          ? `${formatEther(c.settlementAmount)} ETH`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Approvals</p>
                      <p className="font-semibold text-slate-800">
                        {c.approvalCount !== undefined ? `${String(c.approvalCount)} / 3` : '—'}
                      </p>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </main>
  );
}
