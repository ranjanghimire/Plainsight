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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

let cachedClient: SupabaseClient | null = null;
let cachedToken: string | null = null;

function createSupabaseWithToken(token: string | null): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token ? { 'x-plainsight-session': token } : {},
    },
  });
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

export const supabase = getSupabase();
