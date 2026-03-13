import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

// DELETE /api/deals/[id]?wallet_address=0x...
// Only the client who created the deal can delete it, and only when status = 'cancelled'.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get('wallet_address')?.toLowerCase();

  if (!wallet) {
    return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
  }

  const { data: deal, error: fetchError } = await supabaseAdmin
    .from('deals')
    .select('id, client_address, status, form_data')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    await logError('/api/deals DELETE fetch', fetchError);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }
  if (deal.client_address?.toLowerCase() !== wallet) {
    return NextResponse.json({ error: 'Only the client who created this deal can delete it' }, { status: 403 });
  }
  if (deal.status !== 'cancelled') {
    return NextResponse.json({ error: 'Only cancelled deals can be deleted' }, { status: 400 });
  }

  // Delete the document from Supabase Storage if it exists
  const storagePath = deal.form_data?.storage_path as string | undefined;
  if (storagePath) {
    const { error: storageError } = await supabaseAdmin.storage
      .from('deal-documents')
      .remove([storagePath]);
    if (storageError) {
      await logError('/api/deals DELETE storage', storageError);
      // Non-fatal — continue to delete the DB row even if storage removal fails
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from('deals')
    .delete()
    .eq('id', id);

  if (deleteError) {
    await logError('/api/deals DELETE db', deleteError);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
