import { supabaseAdmin } from '@/lib/supabase/server';

export async function logError(route: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const detail  = error instanceof Error ? (error.stack ?? null) : null;
  try {
    await supabaseAdmin.from('error_logs').insert({ route, message, detail });
  } catch {
    // never let logging crash the route
  }
}
