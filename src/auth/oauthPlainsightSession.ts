import { invokeEdgeFunction } from './functionsInvoke';
import { persistAuthDisplayEmail } from './authDisplayEmail';
import { setSession } from './localSession';

export type OAuthPlainsightSessionResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; error: string };

/**
 * Exchanges a Supabase OAuth access token for a Plainsight `sessions` row + local session fields.
 * Reuses `public.users` by verified email (same row as email OTP flow).
 */
export async function establishPlainsightSessionFromSupabaseAccessToken(
  accessToken: string,
): Promise<OAuthPlainsightSessionResult> {
  const trimmed = accessToken.trim();
  if (!trimmed) {
    return { ok: false, error: 'Missing OAuth token.' };
  }

  const { data, error } = await invokeEdgeFunction<{
    error?: string;
    sessionToken?: string;
    userId?: string;
    email?: string;
  }>('auth-oauth-session', {
    body: { access_token: trimmed },
  });

  if (error) {
    return { ok: false, error };
  }

  if (!data || typeof data.error === 'string') {
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'Sign-in failed.' };
  }

  const token = data.sessionToken;
  const userId = data.userId;
  if (typeof token !== 'string' || typeof userId !== 'string') {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  const displayEmail =
    typeof data.email === 'string' && data.email.trim() ? data.email.trim() : '';

  if (displayEmail) {
    persistAuthDisplayEmail(displayEmail);
  }

  setSession(token, userId);

  return {
    ok: true,
    email: displayEmail || '',
    userId,
  };
}
