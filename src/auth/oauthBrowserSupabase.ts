import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** Isolated from sync client: GoTrue session for OAuth only (Google / Apple). */
const OAUTH_STORAGE_KEY = 'plainsight_supabase_oauth';

let oauthClient: SupabaseClient | null = null;

export function isOAuthSignInConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Supabase Auth client with PKCE + URL detection for OAuth redirect return.
 * Do not use for Postgres sync — see `getSupabase()` in `sync/supabaseClient.ts`.
 */
export function getOAuthBrowserSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!oauthClient) {
    oauthClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: OAUTH_STORAGE_KEY,
      },
    });
  }
  return oauthClient;
}

export async function clearOAuthBrowserSession(): Promise<void> {
  const c = getOAuthBrowserSupabase();
  if (!c) return;
  try {
    await c.auth.signOut();
  } catch {
    /* ignore */
  }
}
