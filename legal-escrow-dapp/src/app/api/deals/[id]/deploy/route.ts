import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// PATCH /api/deals/[id]/deploy — Arbiter links the on-chain escrow address after deployment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { escrow_address, arbiter_address } = body;
  if (!escrow_address || !arbiter_address) {
    return NextResponse.json({ error: 'escrow_address and arbiter_address are required' }, { status: 400 });
  }

  const escrowLower = (escrow_address as string).toLowerCase();
  const arbiterLower = (arbiter_address as string).toLowerCase();

  // Fetch the deal
  const { data: deal } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  // Verify arbiter ownership
  if (deal.arbiter_address?.toLowerCase() !== arbiterLower) {
    return NextResponse.json({ error: 'Forbidden: you are not the arbiter of this deal' }, { status: 403 });
  }

  // Already deployed
  if (deal.escrow_address) {
    return NextResponse.json({ error: 'Deal already has an escrow address' }, { status: 409 });
  }

  // Update deal
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('deals')
    .update({ escrow_address: escrowLower, status: 'deployed' })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    await logError('/api/deals/[id]/deploy', updateError);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Create CPRA ledger row (idempotent)
  await supabaseAdmin.from('cpra_ledger_progress').upsert(
    { escrow_address: escrowLower, arbiter_address: arbiterLower },
    { onConflict: 'escrow_address', ignoreDuplicates: true }
  );

  return NextResponse.json({ deal: updated });
}
