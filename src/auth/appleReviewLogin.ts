/**
 * Apple review login (no OTP): invokes a special Edge Function to mint a custom session.
 *
 * This is intentionally narrow and only triggers for the exact review email.
 */
import { invokeEdgeFunction } from './functionsInvoke';
import { persistAuthDisplayEmail } from './authDisplayEmail';
import { setSession } from './localSession';
import { persistLastKnownSyncEntitledForMenu, setSyncEntitlementActive, setSyncRemoteActive } from '../sync/syncEnabled';
 
const APPLE_REVIEW_EMAIL =
  (import.meta.env.VITE_APPLE_REVIEW_EMAIL as string | undefined)?.trim().toLowerCase() ||
  'apple-review@plainsight.app';
 
export type AppleReviewLoginResult =
  | { ok: true; email: string; userId: string }
  | { ok: false; error: string };
 
export function isAppleReviewEmail(email: string): boolean {
  return (email || '').trim().toLowerCase() === APPLE_REVIEW_EMAIL;
}
 
export async function appleReviewLogin(email: string, password: string): Promise<AppleReviewLoginResult> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const pw = (password || '').trim();
  if (!normalizedEmail) return { ok: false, error: 'Enter an email address.' };
  if (!isAppleReviewEmail(normalizedEmail)) return { ok: false, error: 'Not an Apple review account.' };
  if (!pw) return { ok: false, error: 'Enter your password.' };
 
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) {
    return { ok: false, error: 'Sync is not configured (missing Supabase URL or key).' };
  }
 
  const { data, error } = await invokeEdgeFunction<{
    sessionToken?: string;
    userId?: string;
    email?: string;
  }>('auth-apple-review-login', {
    body: { email: normalizedEmail, password: pw },
  });
 
  if (error) return { ok: false, error };
  if (!data || typeof data.sessionToken !== 'string' || typeof data.userId !== 'string') {
    return { ok: false, error: 'Unexpected response from server.' };
  }
 
  const displayEmail = typeof data.email === 'string' && data.email ? data.email : normalizedEmail;
  persistAuthDisplayEmail(displayEmail);
  setSession(data.sessionToken, data.userId);
 
  // Make review builds show "Sync active" immediately; server will reconcile in background too.
  persistLastKnownSyncEntitledForMenu(true);
  setSyncEntitlementActive(true);
  setSyncRemoteActive(true);
 
  return { ok: true, email: displayEmail, userId: data.userId };
}

