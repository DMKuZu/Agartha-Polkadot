import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client — only import this in API route handlers (server-side).
// Never import in client components — SUPABASE_SERVICE_ROLE_KEY must not reach the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
