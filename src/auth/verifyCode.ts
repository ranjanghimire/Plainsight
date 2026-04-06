/**
 * Phase 3: verify OTP via Edge Function and persist session in localStorage.
 */

import { setSession } from './localSession';

const AUTH_DISPLAY_EMAIL_KEY = 'plainsight_auth_display_email';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export type VerifyCodeResult =
  | { ok: true; email: string }
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
  if (!url || !anonKey) {
    return { ok: false, error: 'Sync is not configured (missing Supabase URL or key).' };
  }

  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/auth-verify-code`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ email: normalizedEmail, code: digits }),
    });

    let payload: {
      error?: string;
      sessionToken?: string;
      userId?: string;
      email?: string;
    } = {};
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const msg =
        typeof payload.error === 'string' && payload.error
          ? payload.error
          : `Request failed (${res.status})`;
      return { ok: false, error: msg };
    }

    const token = payload.sessionToken;
    const userId = payload.userId;
    if (typeof token !== 'string' || typeof userId !== 'string') {
      return { ok: false, error: 'Unexpected response from server.' };
    }

    const displayEmail =
      typeof payload.email === 'string' && payload.email
        ? payload.email
        : normalizedEmail;

    try {
      sessionStorage.setItem(AUTH_DISPLAY_EMAIL_KEY, displayEmail);
    } catch {
      /* ignore */
    }

    setSession(token, userId);

    return { ok: true, email: displayEmail };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: message };
  }
}
