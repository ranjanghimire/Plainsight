import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ArchivedNote,
  Category,
  Note,
  SyncError,
  Workspace,
  WorkspacePin,
} from './types';
import { getCanUseSupabase, subscribeSyncGating } from './syncEnabled';
import { getSession as getLocalSession } from '../auth/localSession';

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Attach x-plainsight-session for PostgREST / Realtime requests to this project.
 */
function plainsightSupabaseFetch(supabaseOrigin: string, baseFetch: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const target = resolveRequestUrl(input);
    if (!supabaseOrigin || !target.startsWith(supabaseOrigin)) {
      return baseFetch(input, init);
    }
    const token = getLocalSession().sessionToken;
    if (!token) {
      return baseFetch(input, init);
    }
    const merged = new Headers();
    if (input instanceof Request) {
      input.headers.forEach((v, k) => merged.set(k, v));
    }
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => merged.set(k, v));
    }
    merged.set('x-plainsight-session', token);
    return baseFetch(input, { ...init, headers: merged });
  };
}

/**
 * Configure via Vite env:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 *
 * Database client only — no Supabase Auth (Phase 1 uses localSession).
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const supabaseOrigin = (() => {
  if (!supabaseUrl) return '';
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return '';
  }
})();

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  global: {
    fetch: plainsightSupabaseFetch(supabaseOrigin, fetch),
  },
});

function syncDebugGlobals() {
  if (!getCanUseSupabase()) return;
  // @ts-ignore TEMPORARY — for debugging only
  window.supabase = supabase;
}

subscribeSyncGating(() => {
  if (!getCanUseSupabase()) return;
  syncDebugGlobals();
});

export function getAuthedUserId(): string | null {
  return getLocalSession().userId;
}

function err(message: string, details?: unknown): SyncError {
  return { message, details };
}

export async function fetchAllWorkspaces(): Promise<{ data: Workspace[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as Workspace[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch workspaces', e) };
  }
}

export async function fetchCategories(workspaceId: string): Promise<{ data: Category[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });
    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as Category[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch categories', e) };
  }
}

export async function fetchNotes(workspaceId: string): Promise<{ data: Note[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as Note[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch notes', e) };
  }
}

export async function fetchArchivedNotes(workspaceId: string): Promise<{ data: ArchivedNote[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const { data, error } = await supabase
      .from('archived_notes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('last_deleted_at', { ascending: false });
    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as ArchivedNote[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch archived notes', e) };
  }
}

export async function fetchWorkspacePins(): Promise<{ data: WorkspacePin[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const { data, error } = await supabase
      .from('workspace_pins')
      .select('*')
      .order('position', { ascending: true });
    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as WorkspacePin[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch workspace pins', e) };
  }
}
