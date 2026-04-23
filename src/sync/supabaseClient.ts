import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { invokeEdgeFunction } from '../auth/functionsInvoke';
import { sendClientErrorReport } from '../telemetry/clientErrorReporter';
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

/**
 * After long PWA / mobile backgrounding, the Realtime JWT can expire while the
 * `x-plainsight-session` header stays valid — REST sync works but private channels
 * and broadcast auth drift. Re-fetch JWT and await before (re)subscribing.
 */
export async function refreshSupabaseRealtimeJwt(): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  const client = getSupabase();
  const token = getLocalSession().sessionToken?.trim() ?? '';
  realtimeAuthReady = applyRealtimeJwtAuth(client, token).catch(() => undefined);
  await realtimeAuthReady;
}

/** Private Realtime channels need `auth.jwt()` / `auth.uid()` on the WebSocket — not `x-plainsight-session`. */
async function applyRealtimeJwtAuth(client: SupabaseClient, plainsightSession: string) {
  if (!plainsightSession) {
    try {
      await client.realtime.setAuth(null);
    } catch {
      /* ignore */
    }
    void sendClientErrorReport({
      type: 'realtime.auth_missing',
      message: 'Realtime auth disabled: missing plainsight session token',
    });
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
    void sendClientErrorReport({
      type: 'realtime.auth_missing',
      message: `Realtime auth disabled: auth-realtime-jwt did not return a JWT (error=${String(
        error || 'missing_jwt',
      )})`,
    });
    return;
  }
  try {
    await client.realtime.setAuth(data.realtimeJwt);
  } catch (e) {
    console.warn('[Plainsight] realtime.setAuth failed', e);
    void sendClientErrorReport({
      type: 'realtime.auth_missing',
      message: 'Realtime auth failed: realtime.setAuth threw',
      stack: e instanceof Error ? e.stack : String(e),
    });
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

function describeSupabaseError(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const anyErr = details as Record<string, unknown>;
  const msg = typeof anyErr.message === 'string' ? anyErr.message.trim() : '';
  const code = typeof anyErr.code === 'string' ? anyErr.code.trim() : '';
  const hint = typeof anyErr.hint === 'string' ? anyErr.hint.trim() : '';
  const status =
    typeof anyErr.status === 'number'
      ? String(anyErr.status)
      : typeof anyErr.status === 'string'
        ? anyErr.status.trim()
        : '';
  const pieces = [msg, code ? `code=${code}` : '', status ? `status=${status}` : '', hint ? `hint=${hint}` : '']
    .filter(Boolean)
    .join(' ');
  return pieces;
}

function err(message: string, details?: unknown): SyncError {
  const base = String(message || '').trim();
  if (base) return { message: base, details };
  const derived = describeSupabaseError(details);
  return {
    message: derived || 'Supabase request failed',
    details,
  };
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

/** Page size for per-workspace pulls (avoids Postgres `statement_timeout` on huge workspaces). */
const WORKSPACE_TABLE_PAGE = 350;
const WORKSPACE_PULL_MAX_PAGES = 600;

export async function fetchCategories(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const all: Category[] = [];
    for (let page = 0; page < WORKSPACE_PULL_MAX_PAGES; page += 1) {
      const from = page * WORKSPACE_TABLE_PAGE;
      const to = from + WORKSPACE_TABLE_PAGE - 1;
      const { data, error } = await client
        .from('categories')
        .select('id, workspace_id, name, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (error) return { data: [], error: err(error.message, error) };
      const rows = (data || []) as Category[];
      all.push(...rows);
      if (rows.length < WORKSPACE_TABLE_PAGE) break;
    }
    return { data: all };
  } catch (e) {
    return { data: [], error: err('Failed to fetch categories', e) };
  }
}

export async function fetchNotes(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const all: Note[] = [];
    for (let page = 0; page < WORKSPACE_PULL_MAX_PAGES; page += 1) {
      const from = page * WORKSPACE_TABLE_PAGE;
      const to = from + WORKSPACE_TABLE_PAGE - 1;
      const { data, error } = await client
        .from('notes')
        .select('id, workspace_id, text, category_id, created_at, updated_at, bold_first_line')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      if (error) return { data: [], error: err(error.message, error) };
      const rows = (data || []) as Note[];
      all.push(...rows);
      if (rows.length < WORKSPACE_TABLE_PAGE) break;
    }
    return { data: all };
  } catch (e) {
    return { data: [], error: err('Failed to fetch notes', e) };
  }
}

export async function fetchArchivedNotes(workspaceId: string) {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const all: ArchivedNote[] = [];
    for (let page = 0; page < WORKSPACE_PULL_MAX_PAGES; page += 1) {
      const from = page * WORKSPACE_TABLE_PAGE;
      const to = from + WORKSPACE_TABLE_PAGE - 1;
      const { data, error } = await client
        .from('archived_notes')
        .select('id, workspace_id, text, category_id, last_deleted_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('last_deleted_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      if (error) return { data: [], error: err(error.message, error) };
      const rows = (data || []) as ArchivedNote[];
      all.push(...rows);
      if (rows.length < WORKSPACE_TABLE_PAGE) break;
    }
    return { data: all };
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
