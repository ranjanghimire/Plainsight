/**
 * Phase 4: validate opaque session via Edge Function (RLS + anon key).
 */

import { invokeEdgeFunction } from './functionsInvoke';

export type SessionUserResult =
  | { loggedIn: true; userId: string; email: string }
  | { loggedIn: false };

export async function fetchSessionUser(sessionToken: string): Promise<SessionUserResult> {
  const trimmed = sessionToken.trim();
  if (!trimmed) {
    return { loggedIn: false };
  }

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) {
    return { loggedIn: false };
  }

  const { data, error } = await invokeEdgeFunction<{
    loggedIn?: boolean;
    userId?: string;
    email?: string;
  }>('auth-session-user', {
    method: 'GET',
    headers: { 'x-plainsight-session': trimmed },
  });

  if (error || !data || data.loggedIn !== true) {
    return { loggedIn: false };
  }

  const userId = data.userId;
  const email = data.email;
  if (typeof userId !== 'string' || typeof email !== 'string') {
    return { loggedIn: false };
  }

  return { loggedIn: true, userId, email };
}
