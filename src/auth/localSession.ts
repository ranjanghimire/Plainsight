/**
 * Phase 1: local-only "session" (no Supabase Auth).
 * owner_id / RLS must use a UUID-shaped id for Postgres compatibility.
 */
const STORAGE_USER = 'plainsight_local_user_id';
const STORAGE_TOKEN = 'plainsight_local_session_token';

export const LOCAL_DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_DEV_SESSION_TOKEN = 'local-dev-session';

const SESSION_EVENT = 'plainsight:local-session';

export type LocalSession = {
  sessionToken: string | null;
  userId: string | null;
};

function emitSessionChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT));
  } catch {
    /* ignore */
  }
}

export function getSession(): LocalSession {
  try {
    if (typeof localStorage === 'undefined') {
      return { sessionToken: null, userId: null };
    }
    const token = localStorage.getItem(STORAGE_TOKEN);
    const user = localStorage.getItem(STORAGE_USER);
    return {
      sessionToken: token?.trim() || null,
      userId: user?.trim() || null,
    };
  } catch {
    return { sessionToken: null, userId: null };
  }
}

export function setSession(sessionToken: string, userId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_USER, userId);
    localStorage.setItem(STORAGE_TOKEN, sessionToken);
  } catch {
    /* ignore */
  }
  emitSessionChanged();
}

export function clearSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_TOKEN);
  } catch {
    /* ignore */
  }
  emitSessionChanged();
}

/** First load: persist deterministic fake session. Call after clearSession to restore Phase 1 defaults. */
export function ensureLocalSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(STORAGE_USER)) {
      localStorage.setItem(STORAGE_USER, LOCAL_DEV_USER_ID);
      localStorage.setItem(STORAGE_TOKEN, LOCAL_DEV_SESSION_TOKEN);
      emitSessionChanged();
    }
  } catch {
    /* ignore */
  }
}

ensureLocalSession();
