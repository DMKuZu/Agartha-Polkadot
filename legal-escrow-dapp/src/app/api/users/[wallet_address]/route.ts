import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wallet_address: string }> }
) {
  const { wallet_address } = await params;
  const wallet = wallet_address.toLowerCase();

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .ilike('wallet_address', wallet)
    .maybeSingle();

  return NextResponse.json({ user: user ?? null });
}
