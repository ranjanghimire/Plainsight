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

/**
 * Create a Supabase client that ALWAYS includes the current session token
 * in the x-plainsight-session header.
 *
 * This is the ONLY reliable way to ensure RLS works for all PostgREST calls.
 */
function getSupabase(): SupabaseClient {
  const token = getLocalSession().sessionToken;

  return createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token
          ? { 'x-plainsight-session': token }
          : {},
      },
    }
  );
}

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
   FETCH FUNCTIONS — all now use getSupabase() so headers are correct
-------------------------------------------------------------- */

export async function fetchAllWorkspaces(): Promise<{ data: Workspace[]; error?: SyncError }> {
  if (!getCanUseSupabase()) return { data: [] };
  try {
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
    const supabase = getSupabase();
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
