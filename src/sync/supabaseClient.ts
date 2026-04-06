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

/**
 * Configure via Vite env:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
);

let authListenersStarted = false;
let authUserId: string | null = null;

function ensureSupabaseAuthListeners() {
  if (authListenersStarted || !getCanUseSupabase()) return;
  authListenersStarted = true;

  supabase.auth.getSession().then(({ data }) => {
    authUserId = data.session?.user?.id ?? null;
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    authUserId = session?.user?.id ?? null;
  });
}

function syncDebugGlobals() {
  if (!getCanUseSupabase()) return;
  // @ts-ignore TEMPORARY — for debugging only
  window.supabase = supabase;
}

subscribeSyncGating(() => {
  if (!getCanUseSupabase()) return;
  ensureSupabaseAuthListeners();
  syncDebugGlobals();
});

export function getAuthedUserId(): string | null {
  return authUserId;
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
