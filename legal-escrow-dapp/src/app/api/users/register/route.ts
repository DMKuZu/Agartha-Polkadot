import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.wallet_address || !body.role) {
    return NextResponse.json({ error: 'wallet_address and role are required' }, { status: 400 });
  }

  const wallet = (body.wallet_address as string).toLowerCase();
  const role = body.role as string;

  if (!['client', 'freelancer', 'arbiter'].includes(role)) {
    return NextResponse.json({ error: 'role must be client, freelancer, or arbiter' }, { status: 400 });
  }

  // Check if wallet already registered
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('*')
    .ilike('wallet_address', wallet)
    .maybeSingle();

  if (existing) {
    if (existing.role === role) {
      return NextResponse.json({ user: existing }, { status: 200 });
    }
    return NextResponse.json(
      { error: `Wallet already registered as ${existing.role}`, existing_role: existing.role },
      { status: 409 }
    );
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .insert({ wallet_address: wallet, role })
    .select()
    .single();

  if (error) {
    await logError('/api/users/register', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ user }, { status: 201 });
}
