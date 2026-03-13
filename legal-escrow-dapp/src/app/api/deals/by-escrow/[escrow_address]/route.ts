import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// GET /api/deals/by-escrow/[escrow_address]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ escrow_address: string }> }
) {
  const { escrow_address } = await params;

  const { data: deal } = await supabaseAdmin
    .from('deals')
    .select('*')
    .ilike('escrow_address', escrow_address)
    .maybeSingle();

  return NextResponse.json({ deal: deal ?? null });
}
