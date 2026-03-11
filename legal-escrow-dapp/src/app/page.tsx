'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';

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

export default function OnboardingPage() {
  const router = useRouter();
  const { isConnected } = useAccount();

  const selectRole = (role: Role) => {
    localStorage.setItem('agartha_role', role);
    router.push(`/${role}`);
  };

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

        {/* Role selector */}
        <div className="mb-4">
          <h2 className="text-center text-sm font-semibold text-slate-500 uppercase tracking-widest mb-6">
            Select your role to continue
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ROLES.map((role) => (
              <div
                key={role.id}
                className={`${role.color} ${role.border} border-2 rounded-xl p-6 flex flex-col transition-all cursor-pointer`}
                onClick={() => isConnected && selectRole(role.id)}
              >
                <h3 className="text-xl font-bold text-slate-800 mb-2">{role.title}</h3>
                <p className="text-sm text-slate-600 flex-1 mb-5">{role.description}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); selectRole(role.id); }}
                  disabled={!isConnected}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${role.btn} disabled:bg-slate-300 disabled:cursor-not-allowed`}
                >
                  {isConnected ? `Continue as ${role.title}` : 'Connect wallet first'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {!isConnected && (
          <p className="text-center text-xs text-slate-400 mt-4">
            Connect your Web3 wallet above to select a role and enter the platform.
          </p>
        )}

      </div>
    </main>
  );
}
