import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// GET /api/ledger/[escrow_address]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ escrow_address: string }> }
) {
  const { escrow_address } = await params;

  const { data: progress } = await supabaseAdmin
    .from('cpra_ledger_progress')
    .select('*')
    .ilike('escrow_address', escrow_address.toLowerCase())
    .maybeSingle();

  return NextResponse.json({ progress: progress ?? null });
}

// PUT /api/ledger/[escrow_address]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ escrow_address: string }> }
) {
  const { escrow_address } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { arbiter_address, registered, deposit_recorded, disbursement_recorded, closed } = body;
  if (!arbiter_address) {
    return NextResponse.json({ error: 'arbiter_address is required' }, { status: 400 });
  }

  const escrowLower = escrow_address.toLowerCase();
  const arbiterLower = (arbiter_address as string).toLowerCase();

  // Fetch existing progress row
  const { data: existing } = await supabaseAdmin
    .from('cpra_ledger_progress')
    .select('*')
    .ilike('escrow_address', escrowLower)
    .maybeSingle();

  if (existing && existing.arbiter_address?.toLowerCase() !== arbiterLower) {
    return NextResponse.json({ error: 'Forbidden: you are not the arbiter of this case' }, { status: 403 });
  }

  // Upsert — insert row if none exists, otherwise apply monotonic OR (steps can only go true, never false)
  const { data: updated, error } = await supabaseAdmin
    .from('cpra_ledger_progress')
    .upsert(
      {
        escrow_address:        escrowLower,
        arbiter_address:       arbiterLower,
        registered:            (existing?.registered            ?? false) || !!registered,
        deposit_recorded:      (existing?.deposit_recorded      ?? false) || !!deposit_recorded,
        disbursement_recorded: (existing?.disbursement_recorded ?? false) || !!disbursement_recorded,
        closed:                (existing?.closed                ?? false) || !!closed,
      },
      { onConflict: 'escrow_address' }
    )
    .select()
    .single();

  if (error) {
    await logError('/api/ledger/[escrow_address]', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ progress: updated });
}
