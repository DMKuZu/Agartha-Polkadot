import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// POST /api/deals — Client creates a new deal
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { client_address, freelancer_address, arbiter_address, document_hash, form_data } = body;
  if (!client_address || !freelancer_address || !arbiter_address || !document_hash || !form_data) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const clientLower     = (client_address as string).toLowerCase();
  const freelancerLower = (freelancer_address as string).toLowerCase();
  const arbiterLower    = (arbiter_address as string).toLowerCase();

  // Prevent same address from being multiple parties
  if (clientLower === freelancerLower || clientLower === arbiterLower || freelancerLower === arbiterLower) {
    return NextResponse.json({ error: 'Client, freelancer, and arbiter must be different wallets' }, { status: 400 });
  }

  // Verify client is registered as 'client'
  const { data: clientUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .ilike('wallet_address', clientLower)
    .maybeSingle();

  if (!clientUser || clientUser.role !== 'client') {
    return NextResponse.json({ error: 'Wallet not registered as client' }, { status: 403 });
  }

  // Verify freelancer address is registered as 'freelancer'
  const { data: freelancerUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .ilike('wallet_address', freelancerLower)
    .maybeSingle();

  if (!freelancerUser) {
    return NextResponse.json({ error: 'Freelancer address is not registered' }, { status: 400 });
  }
  if (freelancerUser.role !== 'freelancer') {
    return NextResponse.json({ error: `Freelancer address is registered as '${freelancerUser.role}', not 'freelancer'` }, { status: 400 });
  }

  // Verify arbiter address is registered as 'arbiter'
  const { data: arbiterUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .ilike('wallet_address', arbiterLower)
    .maybeSingle();

  if (!arbiterUser) {
    return NextResponse.json({ error: 'Arbiter address is not registered' }, { status: 400 });
  }
  if (arbiterUser.role !== 'arbiter') {
    return NextResponse.json({ error: `Arbiter address is registered as '${arbiterUser.role}', not 'arbiter'` }, { status: 400 });
  }

  const { data: deal, error } = await supabaseAdmin
    .from('deals')
    .insert({
      deal_code_id:        Date.now().toString(36),
      client_address:      clientLower,
      freelancer_address:  freelancerLower,
      arbiter_address:     arbiterLower,
      document_hash,
      form_data,
      status:              'pending_acceptance',
      arbiter_accepted:    false,
      freelancer_accepted: false,
    })
    .select()
    .single();

  if (error) {
    await logError('/api/deals POST', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.', detail: error.message }, { status: 500 });
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
