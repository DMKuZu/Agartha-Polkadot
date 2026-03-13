import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logError } from '@/lib/errors';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file          = formData.get('file') as File | null;
  const walletAddress = formData.get('wallet_address') as string | null;

  if (!file)          return NextResponse.json({ error: 'No file provided' },       { status: 400 });
  if (!walletAddress) return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
  }

  const buffer   = Buffer.from(await file.arrayBuffer());
  const hash     = '0x' + createHash('sha256').update(buffer).digest('hex');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${walletAddress.toLowerCase()}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('deal-documents')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) {
    await logError('/api/deals/upload', uploadError);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    storage_path:  storagePath,
    document_hash: hash,
    filename:      file.name,
  });
}
