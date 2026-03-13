import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// GET /api/deals/by-hash/[document_hash]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ document_hash: string }> }
) {
  const { document_hash } = await params;

  const { data: deal } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('document_hash', document_hash)
    .maybeSingle();

  return NextResponse.json({ deal: deal ?? null });
}
