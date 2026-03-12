'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

type Role = 'client' | 'freelancer' | 'arbiter';

const ROLES: { id: Role; title: string; description: string; color: string; border: string; btn: string }[] = [
  {
    id: 'client',
    title: 'Client',
    description: 'Hire a freelancer safely. Fund the escrow and release payment only when work is delivered to your satisfaction.',
    color: 'bg-blue-50',
    border: 'border-blue-200 hover:border-blue-400',
    btn: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    id: 'freelancer',
    title: 'Freelancer',
    description: 'Deliver work and get paid with certainty. The escrow guarantees your payment is released once the job is done.',
    color: 'bg-emerald-50',
    border: 'border-emerald-200 hover:border-emerald-400',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    id: 'arbiter',
    title: 'Arbiter',
    description: 'Philippine-credentialed legal professional. Review contracts, deploy escrows, and cast the deciding vote in disputes.',
    color: 'bg-indigo-50',
    border: 'border-indigo-200 hover:border-indigo-400',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
  },
];

type ToastEntry = { id: number; message: string; type: 'success' | 'error' };

export default function OnboardingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [isRegistering, setIsRegistering] = useState(false);
  const [conflictRole, setConflictRole] = useState<Role | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = (message: string, type: ToastEntry['type'] = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // On wallet connect, check if already registered and redirect
  useEffect(() => {
    if (!isConnected || !address) return;
    fetch(`/api/users/${address}`)
      .then(r => r.json())
      .then(({ user }) => {
        if (user?.role) {
          localStorage.setItem('agartha_role', user.role);
          router.replace(`/${user.role}`);
        }
      })
      .catch(() => {});
  }, [isConnected, address]);

  const selectRole = async (role: Role) => {
    if (!isConnected || !address || isRegistering) return;
    setIsRegistering(true);
    setConflictRole(null);
    try {
      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, role }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflictRole(data.existing_role as Role);
        showToast(`Wallet already registered as ${data.existing_role}`, 'error');
        return;
      }
      if (!res.ok) {
        showToast(data.error || 'Registration failed', 'error');
        return;
      }
      localStorage.setItem('agartha_role', role);
      router.push(`/${role}`);
    } catch {
      showToast('Network error, please try again', 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  const ROLE_LABELS: Record<Role, string> = { client: 'Client', freelancer: 'Freelancer', arbiter: 'Arbiter' };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center py-16 px-4 bg-slate-100">
      <div className="max-w-3xl w-full">

        {/* Brand header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-800 mb-3">AgarthaTech</h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Trustless, decentralized legal escrow for the freelance economy.
            Bridging Philippine digital agreements with blockchain-enforced payments.
          </p>
          <div className="flex justify-center mt-6">
            <ConnectButton />
          </div>
        </div>

        {/* Role conflict notice */}
        {conflictRole && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg text-center">
            <p className="text-sm font-semibold text-amber-800 mb-2">
              This wallet is already registered as <strong>{ROLE_LABELS[conflictRole]}</strong>.
            </p>
            <button
              onClick={() => { localStorage.setItem('agartha_role', conflictRole); router.push(`/${conflictRole}`); }}
              className="text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              Go to my portal ({ROLE_LABELS[conflictRole]}) →
            </button>
          </div>
        )}

        {/* Role selector */}
        <div className="mb-4">
          <h2 className="text-center text-sm font-semibold text-slate-500 uppercase tracking-widest mb-6">
            Select your role to continue
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ROLES.map((role) => (
              <div
                key={role.id}
                className={`${role.color} ${role.border} border-2 rounded-xl p-6 flex flex-col transition-all ${isConnected && !isRegistering ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
                onClick={() => isConnected && !isRegistering && selectRole(role.id)}
              >
                <h3 className="text-xl font-bold text-slate-800 mb-2">{role.title}</h3>
                <p className="text-sm text-slate-600 flex-1 mb-5">{role.description}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); selectRole(role.id); }}
                  disabled={!isConnected || isRegistering}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${role.btn} disabled:bg-slate-300 disabled:cursor-not-allowed`}
                >
                  {isRegistering
                    ? 'Registering...'
                    : isConnected
                    ? `Continue as ${role.title}`
                    : 'Connect wallet first'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Global Case Ledger link */}
        <div className="text-center mt-6">
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
          >
            View Global Case Ledger →
          </Link>
        </div>

        {!isConnected && (
          <p className="text-center text-xs text-slate-400 mt-4">
            Connect your Web3 wallet above to select a role and enter the platform.
          </p>
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
  );
}
