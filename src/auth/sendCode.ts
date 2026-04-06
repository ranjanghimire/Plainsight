/**
 * Phase 2: invoke Edge Function to generate + email OTP (no verification yet).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type SendCodeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendCode(email: string): Promise<SendCodeResult> {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: 'Enter an email address.' };
  }
  if (!url || !anonKey) {
    return { ok: false, error: 'Sync is not configured (missing Supabase URL or key).' };
  }

  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/auth-send-code`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ email: trimmed }),
    });

    let payload: { error?: string; success?: boolean } = {};
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

    if (payload.success !== true) {
      return { ok: false, error: 'Unexpected response from server.' };
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: message };
  }
}
