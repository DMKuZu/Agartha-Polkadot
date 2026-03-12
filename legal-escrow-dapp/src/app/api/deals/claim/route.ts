import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// POST /api/deals/claim — Arbiter claims a deal via base64 deal code
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { deal_code, arbiter_address } = body;
  if (!deal_code || !arbiter_address) {
    return NextResponse.json({ error: 'deal_code and arbiter_address are required' }, { status: 400 });
  }

  const arbiterLower = (arbiter_address as string).toLowerCase();

  // Verify arbiter is registered as 'arbiter'
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .ilike('wallet_address', arbiterLower)
    .maybeSingle();

  if (!user || user.role !== 'arbiter') {
    return NextResponse.json({ error: 'Wallet not registered as arbiter' }, { status: 403 });
  }

  // Decode deal code
  let decoded: any;
  try {
    decoded = JSON.parse(Buffer.from(deal_code.trim(), 'base64').toString('utf-8'));
  } catch {
    return NextResponse.json({ error: 'Invalid deal code format' }, { status: 400 });
  }

  if (!decoded.id || !decoded.clientAddress || !decoded.documentHash) {
    return NextResponse.json({ error: 'Malformed deal code' }, { status: 400 });
  }

  // Role conflict check
  const clientLower = (decoded.clientAddress as string).toLowerCase();
  const freelancerLower = (decoded.freelancerAddress as string)?.toLowerCase() ?? '';

  if (arbiterLower === clientLower || arbiterLower === freelancerLower) {
    return NextResponse.json(
      { error: 'Arbiter cannot be a party to this deal' },
      { status: 403 }
    );
  }

  // Try to find existing deal by deal_code_id
  const { data: existingDeal } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('deal_code_id', decoded.id)
    .maybeSingle();

  if (existingDeal) {
    // Already claimed by this arbiter — idempotent
    if (existingDeal.arbiter_address?.toLowerCase() === arbiterLower) {
      return NextResponse.json({ deal: existingDeal });
    }
    // Already claimed by a different arbiter
    if (existingDeal.arbiter_address) {
      return NextResponse.json({ error: 'Deal already claimed by another arbiter' }, { status: 409 });
    }
    // Unclaimed — claim it
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('deals')
      .update({ arbiter_address: arbiterLower })
      .eq('id', existingDeal.id)
      .select()
      .single();

    if (updateError) {
      await logError('/api/deals/claim', updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ deal: updated });
  }

  // Deal not in DB yet — insert from decoded payload (backward compat: client may not have saved yet)
  const formData = {
    title:             decoded.title || '',
    deliverables:      decoded.deliverables || '',
    deadline:          decoded.deadline || '',
    amount:            decoded.amount || '',
    clientAddress:     decoded.clientAddress || '',
    freelancerAddress: decoded.freelancerAddress || '',
  };

  const { data: newDeal, error: insertError } = await supabaseAdmin
    .from('deals')
    .insert({
      deal_code_id:      decoded.id,
      client_address:    clientLower,
      freelancer_address: freelancerLower,
      arbiter_address:   arbiterLower,
      document_hash:     decoded.documentHash,
      form_data:         formData,
      status:            'pending',
    })
    .select()
    .single();

  if (insertError) {
    await logError('/api/deals/claim', insertError);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ deal: newDeal });
}
