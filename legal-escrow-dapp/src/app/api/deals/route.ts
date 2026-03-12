import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// POST /api/deals — Client creates a new deal
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { client_address, freelancer_address, document_hash, form_data, deal_code_id } = body;
  if (!client_address || !freelancer_address || !document_hash || !form_data || !deal_code_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const clientLower = (client_address as string).toLowerCase();
  const freelancerLower = (freelancer_address as string).toLowerCase();

  // Verify client is registered as 'client'
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .ilike('wallet_address', clientLower)
    .maybeSingle();

  if (!user || user.role !== 'client') {
    return NextResponse.json({ error: 'Wallet not registered as client' }, { status: 403 });
  }

  const { data: deal, error } = await supabaseAdmin
    .from('deals')
    .insert({
      deal_code_id,
      client_address: clientLower,
      freelancer_address: freelancerLower,
      document_hash,
      form_data,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Deal already exists' }, { status: 409 });
    }
    await logError('/api/deals POST', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ deal }, { status: 201 });
}

// GET /api/deals?wallet_address=0x...
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet_address')?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
  }

  const { data: deals, error } = await supabaseAdmin
    .from('deals')
    .select('*')
    .or(
      `client_address.ilike.${wallet},freelancer_address.ilike.${wallet},arbiter_address.ilike.${wallet}`
    )
    .order('created_at', { ascending: false });

  if (error) {
    await logError('/api/deals GET', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ deals: deals ?? [] });
}
