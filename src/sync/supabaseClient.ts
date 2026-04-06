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

/**
 * Always returns a Supabase client whose headers reflect
 * the current local session token.
 */
export function getSupabase(): SupabaseClient {
  const token = getLocalSession().sessionToken ?? null;

  if (!cachedClient || token !== cachedToken) {
    cachedToken = token;
    cachedClient = createSupabaseWithToken(token);
  }

  return cachedClient;
}

/**
 * Legacy export for existing imports: `import { supabase } from './supabaseClient'`
 * This will always resolve to the current client.
 */
export const supabase: SupabaseClient = getSupabase();

function err(message: string, details?: unknown): SyncError {
  return { message, details };
}

export function getAuthedUserId(): string | null {
  return getLocalSession().userId;
}

/**
 * Debug helper — exposes the live Supabase client on window.supabase
 * when sync is enabled.
 */
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
   FETCH FUNCTIONS — all use getSupabase() so headers are correct
-------------------------------------------------------------- */

export async function fetchAllWorkspaces(): Promise<{ data: Workspace[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const client = getSupabase();
    const { data, error } = await client
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
    const client = getSupabase();
    const { data, error } = await client
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
    const client = getSupabase();
    const { data, error } = await client
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
    const client = getSupabase();
    const { data, error } = await client
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
    const client = getSupabase();
    const { data, error } = await client
      .from('workspace_pins')
      .select('*')
      .order('position', { ascending: true });

    if (error) return { data: [], error: err(error.message, error) };
    return { data: (data || []) as WorkspacePin[] };
  } catch (e) {
    return { data: [], error: err('Failed to fetch workspace pins', e) };
  }
}
