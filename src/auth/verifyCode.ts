/**
 * Phase 3: verify OTP via Edge Function and persist session in localStorage.
 */

import { persistAuthDisplayEmail } from './authDisplayEmail';
import { setSession } from './localSession';
import { invokeEdgeFunction } from './functionsInvoke';

export type VerifyCodeResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; error: string };

export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const digits = (code || '').replace(/\D/g, '').slice(0, 6);
  if (!normalizedEmail) {
    return { ok: false, error: 'Missing email.' };
  }
  if (digits.length !== 6) {
    return { ok: false, error: 'Enter the 6-digit code.' };
  }

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) {
    return { ok: false, error: 'Sync is not configured (missing Supabase URL or key).' };
  }

  const { data, error } = await invokeEdgeFunction<{
    error?: string;
    sessionToken?: string;
    userId?: string;
    email?: string;
  }>('auth-verify-code', {
    body: { email: normalizedEmail, code: digits },
  });

  if (error) {
    return { ok: false, error };
  }

  if (!data) {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  const token = data.sessionToken;
  const userId = data.userId;
  if (typeof token !== 'string' || typeof userId !== 'string') {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  const displayEmail =
    typeof data.email === 'string' && data.email ? data.email : normalizedEmail;

  persistAuthDisplayEmail(displayEmail);

  setSession(token, userId);

  return { ok: true, email: displayEmail, userId };
}
