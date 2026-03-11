'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const [storedRole, setStoredRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem('agartha_role') as Role | null;
    setStoredRole(role);
    setChecked(true);

    if (!role) {
      router.replace('/');
    }
  }, [router]);

  if (!checked) return null;

  // No role set — redirecting
  if (!storedRole) return null;

  // Wrong role — show a prompt
  if (storedRole !== requiredRole) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 bg-slate-100">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 max-w-sm w-full text-center">
          <p className="text-sm text-slate-600 mb-1">You are registered as</p>
          <p className="text-xl font-bold text-slate-800 mb-4">{ROLE_LABELS[storedRole]}</p>
          <p className="text-sm text-slate-500 mb-6">
            This page is for the <strong>{ROLE_LABELS[requiredRole]}</strong> role.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href={ROLE_ROUTES[storedRole]}
              className="block w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors text-center"
            >
              Go to my portal ({ROLE_LABELS[storedRole]})
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem('agartha_role');
                router.replace('/');
              }}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Change role
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Correct role — render children
  return <>{children}</>;
}
