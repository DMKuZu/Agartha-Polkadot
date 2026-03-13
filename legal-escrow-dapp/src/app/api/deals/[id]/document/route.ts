import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get('wallet_address')?.toLowerCase();

  if (!wallet) {
    return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
  }

  // Fetch deal
  const { data: deal, error: dealError } = await supabaseAdmin
    .from('deals')
    .select('client_address, freelancer_address, arbiter_address, form_data')
    .eq('id', id)
    .maybeSingle();

  if (dealError || !deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  // Verify caller is a party to this deal
  const parties = [
    deal.client_address?.toLowerCase(),
    deal.freelancer_address?.toLowerCase(),
    deal.arbiter_address?.toLowerCase(),
  ];

  if (!parties.includes(wallet)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const storagePath: string | undefined = deal.form_data?.storage_path;
  const filename: string | undefined    = deal.form_data?.filename;

  if (!storagePath) {
    return NextResponse.json({ error: 'No document attached to this deal' }, { status: 404 });
  }

  // Generate a 1-hour signed URL
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from('deal-documents')
    .createSignedUrl(storagePath, 3600);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({ url: signedData.signedUrl, filename: filename ?? 'document' });
}
