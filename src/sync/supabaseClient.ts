import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { invokeEdgeFunction } from '../auth/functionsInvoke';
import type {
  ArchivedNote,
  ArchivedNoteTag,
  Category,
  Note,
  NoteTag,
  SyncError,
  Workspace,
  WorkspacePin,
} from './types';
import { getCanUseSupabase, subscribeSyncGating } from './syncEnabled';
import { getSession as getLocalSession } from '../auth/localSession';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

let cachedClient: SupabaseClient | null = null;
let cachedToken: string | null = null;

/** Resolves after `realtime.setAuth` for the current cached client (private channel RLS). */
let realtimeAuthReady: Promise<void> = Promise.resolve();

function createSupabaseWithToken(token: string | null): SupabaseClient {
  const trimmed = token?.trim() ?? '';
  const sessionHeaders: Record<string, string> = trimmed
    ? { 'x-plainsight-session': trimmed }
    : {};

  /**
   * Re-inject session on every REST/realtime-bound fetch. RLS depends on
   * x-plainsight-session; global.headers alone can miss some code paths across supabase-js.
   */
  const nativeFetch: typeof fetch =
    typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : fetch;
  const fetchWithSession: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (trimmed) headers.set('x-plainsight-session', trimmed);
    else headers.delete('x-plainsight-session');
    return nativeFetch(input, { ...init, headers });
  };

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    // Custom session only — do not run GoTrue refresh/user calls (stale sb-* keys → 401 on /auth/v1).
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithSession,
      headers: sessionHeaders,
    },
  });

  realtimeAuthReady = applyRealtimeJwtAuth(client, trimmed).catch(() => undefined);
  return client;
}

/**
 * Await before subscribing to private Realtime channels so joins see `auth.uid()` / `auth.jwt()`.
 * (Edge logs often omit `x-plainsight-session`; the function still receives it when invoked from the app.)
 */
export function whenRealtimeAuthReady(): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return Promise.resolve();
  return realtimeAuthReady;
}

/** Private Realtime channels need `auth.jwt()` / `auth.uid()` on the WebSocket — not `x-plainsight-session`. */
async function applyRealtimeJwtAuth(client: SupabaseClient, plainsightSession: string) {
  if (!plainsightSession) {
    try {
      await client.realtime.setAuth(null);
    } catch {
      /* ignore */
    }
    return;
  }
  const { data, error } = await invokeEdgeFunction<{ realtimeJwt?: string }>('auth-realtime-jwt', {
    method: 'GET',
    headers: { 'x-plainsight-session': plainsightSession },
  });
  if (error || !data?.realtimeJwt || typeof data.realtimeJwt !== 'string') {
    try {
      await client.realtime.setAuth(null);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await client.realtime.setAuth(data.realtimeJwt);
  } catch (e) {
    console.warn('[Plainsight] realtime.setAuth failed', e);
  }
}

export function getSupabase(): SupabaseClient {
  const token = getLocalSession().sessionToken ?? null;

  if (!cachedClient || token !== cachedToken) {
    cachedToken = token;
    cachedClient = createSupabaseWithToken(token);
  }

  return cachedClient;
}

function err(message: string, details?: unknown): SyncError {
  return { message, details };
}

export function getAuthedUserId(): string | null {
  return getLocalSession().userId;
}

function syncDebugGlobals() {
  if (!getCanUseSupabase()) return;
  // @ts-ignore
  window.supabase = getSupabase();
}

subscribeSyncGating(() => {
  if (!getCanUseSupabase()) return;
  syncDebugGlobals();
});

/* -------------------------------------------------------------
   FETCH FUNCTIONS — all use getSupabase()
-------------------------------------------------------------- */

export async function fetchAllWorkspaces() {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: data || [] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch workspaces', e) };
  }
}

export async function fetchCategories(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: data || [] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch categories', e) };
  }
}

export async function fetchNotes(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: data || [] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch notes', e) };
  }
}

export async function fetchArchivedNotes(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('archived_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('last_deleted_at', { ascending: false });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: data || [] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch archived notes', e) };
  }
}

/** Rows mirror `notes.text` first line; maintained by DB triggers. */
export async function fetchNoteTags(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('note_tags')
      .select('note_id, workspace_id, tag')
      .eq('workspace_id', workspaceId)
      .order('tag', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as NoteTag[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch note tags', e) };
  }
}

export async function fetchArchivedNoteTags(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('archived_note_tags')
      .select('archived_note_id, workspace_id, tag')
      .eq('workspace_id', workspaceId)
      .order('tag', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as ArchivedNoteTag[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch archived note tags', e) };
  }
}

export async function fetchWorkspacePins() {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('workspace_pins')
      .select('*')
      .order('position', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: data || [] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch workspace pins', e) };
  }
}
