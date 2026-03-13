'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';

type Role = 'client' | 'freelancer' | 'arbiter';

const ROLE_LABELS: Record<Role, string> = {
  client: 'Client',
  freelancer: 'Freelancer',
  arbiter: 'Arbiter',
};

const ROLE_ROUTES: Record<Role, string> = {
  client: '/client',
  freelancer: '/freelancer',
  arbiter: '/arbiter',
};

interface RoleGuardProps {
  requiredRole: Role;
  children: React.ReactNode;
}

export function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [registeredRole, setRegisteredRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      router.replace('/');
      return;
    }

    // Use cached role for instant render, then verify against DB
    const cached = localStorage.getItem('agartha_role') as Role | null;
    if (cached) setRegisteredRole(cached);

    fetch(`/api/users/${address}`)
      .then(r => r.json())
      .then(({ user }) => {
        if (!user) {
          router.replace('/');
          return;
        }
        const role = user.role as Role;
        localStorage.setItem('agartha_role', role);
        setRegisteredRole(role);
        setChecked(true);
      })
      .catch(() => {
        // On network error fall back to cache
        if (!cached) router.replace('/');
        else setChecked(true);
      });
  }, [isConnected, address]);

  if (!checked && !registeredRole) return null;

  // No role — redirecting
  if (!registeredRole) return null;

  // Wrong role — show prompt
  if (registeredRole !== requiredRole) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-slate-100">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 max-w-sm w-full text-center">
          <p className="text-sm text-slate-600 mb-1">You are registered as</p>
          <p className="text-xl font-bold text-slate-800 mb-4">{ROLE_LABELS[registeredRole]}</p>
          <p className="text-sm text-slate-500 mb-6">
            This page is for the <strong>{ROLE_LABELS[requiredRole]}</strong> role.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={ROLE_ROUTES[registeredRole]}
              className="block w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors text-center"
            >
              Go to my portal ({ROLE_LABELS[registeredRole]})
            </Link>
            <p className="text-xs text-slate-400 mt-1">
              Your role is permanent. Switch wallets to use a different role.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Correct role — render children
  return <>{children}</>;
}
