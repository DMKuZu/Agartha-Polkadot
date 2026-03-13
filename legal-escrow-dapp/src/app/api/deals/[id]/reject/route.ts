import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// POST /api/deals/[id]/reject — Arbiter or freelancer rejects the deal
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { wallet_address } = body;
  if (!wallet_address) {
    return NextResponse.json({ error: 'wallet_address is required' }, { status: 400 });
  }

  const walletLower = (wallet_address as string).toLowerCase();

  const { data: deal } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  if (deal.status === 'cancelled') {
    return NextResponse.json({ error: 'Deal is already cancelled' }, { status: 409 });
  }
  if (deal.status === 'accepted' || deal.status === 'deployed') {
    return NextResponse.json({ error: 'Deal is already accepted or deployed and cannot be cancelled' }, { status: 409 });
  }

  const isArbiter    = deal.arbiter_address?.toLowerCase()    === walletLower;
  const isFreelancer = deal.freelancer_address?.toLowerCase() === walletLower;

  if (!isArbiter && !isFreelancer) {
    return NextResponse.json({ error: 'Forbidden: you are not a party to this deal' }, { status: 403 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('deals')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    await logError('/api/deals/[id]/reject', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ deal: updated });
}
