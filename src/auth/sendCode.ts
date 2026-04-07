/**
 * Phase 2: invoke Edge Function to generate + email OTP (no verification yet).
 */

import { invokeEdgeFunction } from './functionsInvoke';

export type SendCodeResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function sendCode(email: string): Promise<SendCodeResult> {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: 'Enter an email address.' };
  }

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) {
    return { ok: false, error: 'Sync is not configured (missing Supabase URL or key).' };
  }

  const { data, error } = await invokeEdgeFunction<{
    success?: boolean;
    userId?: string;
  }>('auth-send-code', {
    body: { email: trimmed },
  });

  if (error) {
    return { ok: false, error };
  }

  if (!data || data.success !== true || typeof data.userId !== 'string') {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  return { ok: true, userId: data.userId };
}
