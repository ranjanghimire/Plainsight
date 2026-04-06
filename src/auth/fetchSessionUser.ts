/**
 * Phase 4: validate opaque session via Edge Function (RLS + anon key).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type SessionUserResult =
  | { loggedIn: true; userId: string; email: string }
  | { loggedIn: false };

export async function fetchSessionUser(sessionToken: string): Promise<SessionUserResult> {
  const trimmed = sessionToken.trim();
  if (!trimmed) {
    return { loggedIn: false };
  }
  if (!url || !anonKey) {
    return { loggedIn: false };
  }

  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/auth-session-user`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'x-plainsight-session': trimmed,
      },
    });

    let payload: {
      loggedIn?: boolean;
      userId?: string;
      email?: string;
    } = {};
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }

    if (!res.ok || payload.loggedIn !== true) {
      return { loggedIn: false };
    }

    const userId = payload.userId;
    const email = payload.email;
    if (typeof userId !== 'string' || typeof email !== 'string') {
      return { loggedIn: false };
    }

    return { loggedIn: true, userId, email };
  } catch {
    return { loggedIn: false };
  }
}
