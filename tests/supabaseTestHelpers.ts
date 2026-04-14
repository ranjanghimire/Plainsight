/**
 * Supabase helpers for Vitest — uses service role for reads/wipes so tests do not depend on RLS.
 *
 * Required env (paid / remote assertions):
 * - VITE_SUPABASE_URL
 * - VITEST_SUPABASE_SERVICE_ROLE_KEY
 *
 * Paid UI sync uses `x-plainsight-session` (not Supabase Auth JWT). For local `.env.test.local`,
 * `ensurePaidTestIdentity()` upserts `public.users` + `public.sessions` so RLS resolves
 * `plainsight_session_user_id()` to `VITEST_SUPABASE_USER_ID`.
 *
 * Optional: VITE_SUPABASE_ANON_KEY (validated by client init elsewhere).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

let _service: SupabaseClient | null = null;

/** Service-role client for test DB maintenance (not shipped to the app). */
export function getSupabaseServiceClient(): SupabaseClient {
  if (_service) return _service;
  const url = requireEnv('VITE_SUPABASE_URL');
  const key = requireEnv('VITEST_SUPABASE_SERVICE_ROLE_KEY');
  _service = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _service;
}

/**
 * Removes every row from `public.categories` (test database only).
 * Keeps workspaces/notes intact so FKs stay valid for follow-up inserts.
 */
export async function clearSupabaseTables(): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb
    .from('categories')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

export async function getCategories(workspaceId: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from('categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Service-role lookup by exact name (tests only; names are unique per test case). */
export async function getCategoryRowsByExactName(name: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from('categories').select('*').eq('name', name);
  if (error) throw error;
  return data ?? [];
}

export async function insertCategory(name: string, workspaceId: string): Promise<string> {
  const sb = getSupabaseServiceClient();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await sb.from('categories').insert({
    id,
    workspace_id: workspaceId,
    name,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return id;
}

export async function getCategoryById(id: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from('categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

const PAID_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Ensures RLS sees a valid PlainSight session: `public.users` row + `public.sessions` row
 * whose `id` equals `VITEST_SUPABASE_SESSION_TOKEN`.
 * Use only against a dedicated test project (overwrites email for that user id).
 */
export async function ensurePaidTestIdentity(): Promise<void> {
  const userId = requireEnv('VITEST_SUPABASE_USER_ID');
  const token = requireEnv('VITEST_SUPABASE_SESSION_TOKEN');
  const sb = getSupabaseServiceClient();
  const email = `vitest-${userId.replace(/-/g, '')}@plainsight.test`;
  const { error: userErr } = await sb.from('users').upsert(
    { id: userId, email },
    { onConflict: 'id' },
  );
  if (userErr) throw userErr;
  const expiresAt = new Date(Date.now() + PAID_SESSION_TTL_MS).toISOString();
  const { error: sessErr } = await sb.from('sessions').upsert(
    { id: token, user_id: userId, expires_at: expiresAt },
    { onConflict: 'id' },
  );
  if (sessErr) throw sessErr;
}

/** Service-role upsert so `categories.workspace_id` FK and RLS-visible workspace exist. */
export async function ensureRemoteWorkspaceRow(options: {
  workspaceId: string;
  ownerId: string;
  name?: string;
  kind?: 'visible' | 'hidden';
}): Promise<void> {
  const sb = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { workspaceId, ownerId, name = 'Home', kind = 'visible' } = options;
  const { error } = await sb.from('workspaces').upsert(
    {
      id: workspaceId,
      owner_id: ownerId,
      name,
      kind,
      created_at: now,
      updated_at: now,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/**
 * Service-role: delete every workspace (and FK children) for `owner_id` except listed ids.
 * Use for deterministic paid tests when the shared Vitest user has stray rows (e.g. duplicate "Home"
 * names that change `bindMergedWorkspacesToStorageKeys` ordering).
 */
export async function deleteRemoteWorkspacesForOwnerExcept(
  ownerId: string,
  keepWorkspaceIds: string[],
): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb.from('workspaces').select('id').eq('owner_id', ownerId);
  if (error) throw error;
  const keep = new Set((keepWorkspaceIds || []).filter(Boolean));
  for (const row of data || []) {
    const id = typeof row?.id === 'string' ? row.id : '';
    if (!id || keep.has(id)) continue;
    await deleteRemoteWorkspaceCascadeViaService(id);
  }
}

export async function countNotesInWorkspace(workspaceId: string): Promise<number> {
  const sb = getSupabaseServiceClient();
  const { count, error } = await sb
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteAllNotesInWorkspace(workspaceId: string): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from('notes').delete().eq('workspace_id', workspaceId);
  if (error) throw error;
}

export async function deleteAllCategoriesInWorkspace(workspaceId: string): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from('categories').delete().eq('workspace_id', workspaceId);
  if (error) throw error;
}

/** Service-role insert for hydration regression tests (simulates remote state after a prior sync). */
export async function insertNoteRowViaService(row: {
  id: string;
  workspace_id: string;
  text: string;
  category_id?: string | null;
  created_at: string;
  updated_at: string;
}): Promise<void> {
  const sb = getSupabaseServiceClient();
  const { error } = await sb.from('notes').insert({
    id: row.id,
    workspace_id: row.workspace_id,
    text: row.text,
    category_id: row.category_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  if (error) throw error;
}

/**
 * Service-role teardown for a workspace (child rows then `workspaces` row).
 */
/** Service-role read of `public.note_tags` (RLS bypass for Vitest). */
export async function getNoteTagsForWorkspace(workspaceId: string) {
  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from('note_tags')
    .select('note_id, workspace_id, tag')
    .eq('workspace_id', workspaceId)
    .order('tag', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deleteRemoteWorkspaceCascadeViaService(workspaceId: string): Promise<void> {
  const id = (workspaceId || '').trim();
  if (!id) return;
  const sb = getSupabaseServiceClient();
  const { error: ntErr } = await sb.from('note_tags').delete().eq('workspace_id', id);
  if (ntErr) throw ntErr;
  const { error: nErr } = await sb.from('notes').delete().eq('workspace_id', id);
  if (nErr) throw nErr;
  const { error: aErr } = await sb.from('archived_notes').delete().eq('workspace_id', id);
  if (aErr) throw aErr;
  const { error: cErr } = await sb.from('categories').delete().eq('workspace_id', id);
  if (cErr) throw cErr;
  const { error: pErr } = await sb.from('workspace_pins').delete().eq('workspace_id', id);
  if (pErr) throw pErr;
  const { error: wErr } = await sb.from('workspaces').delete().eq('id', id);
  if (wErr) throw wErr;
}
