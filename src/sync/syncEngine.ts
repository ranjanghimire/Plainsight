import type {
  ArchivedNote,
  Category,
  Note,
  SyncError,
  Workspace,
  WorkspacePin,
} from './types';
import {
  getSupabase,
  fetchAllWorkspaces,
  fetchArchivedNotes,
  fetchCategories,
  fetchNotes,
  fetchWorkspacePins,
} from './supabaseClient';
import {
  clearLocalWorkspaceData,
  getLocalArchivedNotes,
  getLocalArchivedNoteTombstones,
  getLocalCategories,
  getLocalNoteTombstones,
  getLocalNotes,
  getLocalWorkspaces,
  getLocalWorkspacePins,
  saveLocalArchivedNotes,
  saveLocalCategories,
  saveLocalArchivedNoteTombstones,
  saveLocalNoteTombstones,
  saveLocalNotes,
  saveLocalWorkspaces,
  saveLocalWorkspacePins,
} from './localDB';
import {
  mergeArchivedNotes,
  mergeCategories,
  mergeNotes,
  mergeWorkspacePins,
} from './mergeLogic';
import {
  alignArchivedNoteCategoryIds,
  alignNoteCategoryIds,
  ensureWorkspaceUiBlob,
  flushWorkspaceUiIntoLocalDb,
  hydrateWorkspaceUiFromLocalDb,
} from './workspaceStorageBridge';
import { v4 as uuidv4 } from 'uuid';
import {
  bindMergedWorkspacesToStorageKeys,
  deleteWorkspace as deleteWorkspaceUiBlob,
  getStorageKeyForWorkspaceId,
  isUuid,
  loadAppState,
  rebuildVisibleWorkspacesFromRemote,
  removeWorkspaceIdMapping,
  saveAppState,
  setWorkspaceIdMapping,
} from '../utils/storage';
import { notifyHydrationComplete } from './hydrationBridge';
import { getCanUseSupabase } from './syncEnabled';
import { getSession as getLocalSession } from '../auth/localSession';

function mkError(message: string, details?: unknown): SyncError {
  return { message, details };
}

async function getOwnerId(): Promise<string | null> {
  if (!getCanUseSupabase()) return null;
  return getLocalSession().userId;
}

/** Always use the signed-in user: local dev placeholder owner_id is not a row in public.users. */
function ensureWorkspaceOwnerId(workspaces: Workspace[], ownerId: string): Workspace[] {
  return workspaces.map((w) => ({ ...w, owner_id: ownerId }));
}

function ensureWorkspacePinUserId(pins: WorkspacePin[], userId: string): WorkspacePin[] {
  return pins.map((p) => ({ ...p, user_id: userId }));
}

/**
 * PostgREST upsert uses onConflict=id. A separate UNIQUE(owner_id, name) (or similar) still
 * rejects a second INSERT with the same name → 409. Remote+local merges can produce two UUIDs
 * with the same label; suffix duplicates so every row is unique for that constraint.
 */
function disambiguateWorkspaceNamesForPush(rows: Workspace[]): Workspace[] {
  const seenCount = new Map<string, number>();
  return rows.map((w) => {
    const rawName = (w.name || '').trim() || 'Workspace';
    const key = `${w.owner_id}:${w.kind}:${rawName.toLowerCase()}`;
    const n = (seenCount.get(key) || 0) + 1;
    seenCount.set(key, n);
    if (n === 1) return w;
    return { ...w, name: `${rawName} (${n})` };
  });
}

function prepareWorkspacesForRemote(rows: Workspace[], ownerId: string): Workspace[] {
  return disambiguateWorkspaceNamesForPush(ensureWorkspaceOwnerId(rows, ownerId));
}

function isPostgresPkConflict(error: { code?: string; message?: string }): boolean {
  const msg = typeof error.message === 'string' ? error.message : '';
  return (
    error.code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('workspaces_pkey')
  );
}

/**
 * Another account already owns this workspace primary key remotely. Assign a fresh id locally and
 * move all per-workspace data + storage-key bindings (new tab / sign-out leaves stale UUIDs).
 */
async function remapLocalWorkspaceUuidAfterPkCollision(
  oldId: string,
  newId: string,
  ownerId: string,
  workspaceRow: Workspace,
): Promise<void> {
  const cats = await getLocalCategories(oldId);
  const notes = await getLocalNotes(oldId);
  const arch = await getLocalArchivedNotes(oldId);
  const nt = await getLocalNoteTombstones(oldId);
  const at = await getLocalArchivedNoteTombstones(oldId);

  const rewriteWs = <T extends { workspace_id: string }>(rows: T[]): T[] =>
    rows.map((r) => ({ ...r, workspace_id: newId }));

  await saveLocalCategories(newId, rewriteWs(cats));
  await saveLocalNotes(newId, rewriteWs(notes));
  await saveLocalArchivedNotes(newId, rewriteWs(arch));
  await saveLocalNoteTombstones(newId, rewriteWs(nt));
  await saveLocalArchivedNoteTombstones(newId, rewriteWs(at));

  try {
    localStorage.removeItem(`plainsight_local_categories_${oldId}`);
    localStorage.removeItem(`plainsight_local_notes_${oldId}`);
    localStorage.removeItem(`plainsight_local_archived_${oldId}`);
    localStorage.removeItem(`plainsight_local_note_tombstones_${oldId}`);
    localStorage.removeItem(`plainsight_local_archived_tombstones_${oldId}`);
  } catch {
    /* ignore */
  }

  const wsList = await getLocalWorkspaces();
  await saveLocalWorkspaces(
    wsList.map((w) => (w.id === oldId ? { ...w, id: newId, owner_id: ownerId } : w)),
  );

  const pins = await getLocalWorkspacePins();
  await saveLocalWorkspacePins(
    pins.map((p) => (p.workspace_id === oldId ? { ...p, workspace_id: newId } : p)),
  );

  const storageKey = getStorageKeyForWorkspaceId(oldId);
  if (storageKey) {
    removeWorkspaceIdMapping(storageKey, oldId);
    setWorkspaceIdMapping(storageKey, newId);
  }

  const isNonHomeVisible =
    workspaceRow.kind === 'visible' &&
    (workspaceRow.name || '').trim().toLowerCase() !== 'home';
  if (isNonHomeVisible) {
    const ok = `ws_visible_${oldId}`;
    const nk = `ws_visible_${newId}`;
    try {
      const raw = localStorage.getItem(ok);
      if (raw) {
        localStorage.setItem(nk, raw);
        localStorage.removeItem(ok);
      }
    } catch {
      /* ignore */
    }
  }
}

export type PushWorkspacesResult =
  | { ok: true; workspaceIdReplacements?: Record<string, string> }
  | { ok: false; error: SyncError };

// -----------------------------
// Pull (raw fetch; no merging)
// -----------------------------

export async function pullWorkspaces(): Promise<{ data: Workspace[]; error?: SyncError }> {
  return fetchAllWorkspaces();
}

export async function pullCategories(workspaceId: string): Promise<{ data: Category[]; error?: SyncError }> {
  return fetchCategories(workspaceId);
}

export async function pullNotes(workspaceId: string): Promise<{ data: Note[]; error?: SyncError }> {
  return fetchNotes(workspaceId);
}

export async function pullArchivedNotes(workspaceId: string): Promise<{ data: ArchivedNote[]; error?: SyncError }> {
  return fetchArchivedNotes(workspaceId);
}

export async function pullWorkspacePins(): Promise<{ data: WorkspacePin[]; error?: SyncError }> {
  return fetchWorkspacePins();
}

// -----------------------------
// Push (upsert; last-write-wins)
// -----------------------------

/**
 * Push workspaces after a pull pass.
 *
 * `workspaceIdsSeenOnRemote` must be the ids returned from the user's RLS-scoped SELECT on
 * `workspaces`. Rows that were never visible on that pull must use plain INSERT: batch upsert
 * hits ON CONFLICT DO UPDATE, and Postgres evaluates USING on the *existing* row; if that row
 * belongs to another account (same UUID pk from a prior browser profile), RLS fails with 42501.
 */
export async function pushWorkspaces(
  localWorkspaces: Workspace[],
  workspaceIdsSeenOnRemote: Set<string>,
): Promise<PushWorkspacesResult> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return { ok: true };
    const rows = prepareWorkspacesForRemote(localWorkspaces, ownerId);
    const seen = workspaceIdsSeenOnRemote;
    const toUpsert = rows.filter((w) => w.id && seen.has(w.id));
    const toInsert = rows.filter((w) => w.id && !seen.has(w.id));

    const sb = getSupabase();
    if (toUpsert.length > 0) {
      const { error } = await sb.from('workspaces').upsert(toUpsert, { onConflict: 'id' });
      if (error) return { ok: false, error: mkError(error.message, error) };
    }

    const workspaceIdReplacements: Record<string, string> = {};
    if (toInsert.length > 0) {
      for (const prep of toInsert) {
        let row = { ...prep };
        let inserted = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error } = await sb.from('workspaces').insert([row]);
          if (!error) {
            inserted = true;
            break;
          }
          if (isPostgresPkConflict(error) && attempt < 2) {
            const oldPk = row.id;
            const newId = uuidv4();
            await remapLocalWorkspaceUuidAfterPkCollision(oldPk, newId, ownerId, row);
            const list = await getLocalWorkspaces();
            bindMergedWorkspacesToStorageKeys(list);
            const nextVisible = rebuildVisibleWorkspacesFromRemote(list);
            const appPrev = loadAppState();
            saveAppState(nextVisible, appPrev.lastActiveStorageKey);
            workspaceIdReplacements[oldPk] = newId;
            row = { ...row, id: newId, owner_id: ownerId };
            continue;
          }
          return { ok: false, error: mkError(error.message, error) };
        }
        if (!inserted) return { ok: false, error: mkError('Workspace insert failed', new Error()) };
      }
    }

    return Object.keys(workspaceIdReplacements).length > 0
      ? { ok: true, workspaceIdReplacements }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push workspaces', e) };
  }
}

/** Delete one workspace row for the signed-in user (RLS). Call before dropping local menu + IndexedDB row. */
export async function deleteWorkspaceRemote(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return { ok: true };
    if (!workspaceId || typeof workspaceId !== 'string') {
      return { ok: false, error: mkError('Missing workspace id', new Error()) };
    }
    const { error } = await getSupabase().from('workspaces').delete().eq('id', workspaceId);
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to delete workspace', e) };
  }
}

/** Matches `disambiguateWorkspaceNamesForPush`: "Name (2)" or "Name(2)". */
const NUMBERED_VISIBLE_NAME = /^(.+?)\s*\((\d+)\)\s*$/;

function findRedundantNumberedVisibleWorkspaceIds(workspaces: Workspace[]): string[] {
  const visible = workspaces.filter(
    (w) =>
      w?.id &&
      w.kind === 'visible' &&
      (w.name || '').trim().toLowerCase() !== 'home',
  );
  const canonicalNamesLower = new Set<string>();
  for (const w of visible) {
    const nm = (w.name || '').trim();
    if (!nm) continue;
    if (NUMBERED_VISIBLE_NAME.test(nm)) continue;
    canonicalNamesLower.add(nm.toLowerCase());
  }
  const removeIds: string[] = [];
  for (const w of visible) {
    const nm = (w.name || '').trim();
    const m = nm.match(NUMBERED_VISIBLE_NAME);
    if (!m) continue;
    const ord = parseInt(m[2], 10);
    if (!Number.isFinite(ord) || ord < 2) continue;
    const baseLower = m[1].trim().toLowerCase();
    if (canonicalNamesLower.has(baseLower)) {
      removeIds.push(w.id);
    }
  }
  return removeIds;
}

async function purgeWorkspaceClientSide(workspaceId: string): Promise<void> {
  await clearLocalWorkspaceData(workspaceId);
  const pins = await getLocalWorkspacePins();
  await saveLocalWorkspacePins(pins.filter((p) => p.workspace_id !== workspaceId));
  const key = getStorageKeyForWorkspaceId(workspaceId);
  if (key) {
    removeWorkspaceIdMapping(key, workspaceId);
    deleteWorkspaceUiBlob(key);
  }
}

/**
 * When sync merged two same-named visible tabs, push renamed one to "Name (2)". If a canonical
 * "Name" row still exists, the numbered copy is junk — remove it from Supabase + client or it
 * respawns every restart.
 */
async function pruneRedundantNumberedVisibleWorkspaces(
  workspaces: Workspace[],
): Promise<Workspace[]> {
  const removeIds = findRedundantNumberedVisibleWorkspaceIds(workspaces);
  if (removeIds.length === 0) return workspaces;
  const succeeded = new Set<string>();
  for (const id of removeIds) {
    const del = await deleteWorkspaceRemote(id);
    if (del.ok) {
      succeeded.add(id);
      await purgeWorkspaceClientSide(id);
    }
  }
  if (succeeded.size === 0) return workspaces;
  return workspaces.filter((w) => !succeeded.has(w.id));
}

export async function pushCategories(localCategories: Category[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const { error } = await getSupabase()
      .from('categories')
      .upsert(localCategories, { onConflict: 'id' });
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push categories', e) };
  }
}

function sanitizeNotesForPush(rows: Note[]): Note[] {
  const out: Note[] = [];
  for (const row of rows) {
    if (!isUuid(row.workspace_id || '')) {
      console.warn('pushNotes: skipping note with invalid workspace_id', row);
      continue;
    }
    if (!isUuid(row.id || '')) {
      console.warn('pushNotes: regenerating invalid note id', row);
      out.push({ ...row, id: uuidv4() });
      continue;
    }
    out.push(row);
  }
  return out;
}

export async function pushNotes(localNotes: Note[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const notesToPush = sanitizeNotesForPush(localNotes);
    const res = await getSupabase().from('notes').upsert(notesToPush, { onConflict: 'id' }).select('*');
    console.log('pushNotes result:', res);
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push notes', e) };
  }
}

export async function pushArchivedNotes(localArchived: ArchivedNote[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const { error } = await getSupabase()
      .from('archived_notes')
      .upsert(localArchived, { onConflict: 'id' });
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push archived notes', e) };
  }
}

export async function pushArchivedDeletes(
  workspaceId: string,
  archivedIds: string[],
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ids = (archivedIds || []).filter((id) => isUuid(id));
    if (ids.length === 0) return { ok: true };
    const res = await getSupabase().from('archived_notes').delete().in('id', ids).select('*');
    console.log('pushArchivedDeletes result:', { workspaceId, ...res });
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to delete archived notes', e) };
  }
}

export async function pushNoteDeletes(
  workspaceId: string,
  noteIds: string[],
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ids = (noteIds || []).filter((id) => isUuid(id));
    if (ids.length === 0) return { ok: true };
    const res = await getSupabase().from('notes').delete().in('id', ids).select('*');
    console.log('pushNoteDeletes result:', { workspaceId, ...res });
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to delete notes', e) };
  }
}

export async function pushWorkspacePins(localPins: WorkspacePin[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return { ok: true };
    const rows = ensureWorkspacePinUserId(localPins, ownerId);
    // PK is (user_id, workspace_id) so use that as conflict target
    const { error } = await getSupabase()
      .from('workspace_pins')
      .upsert(rows, { onConflict: 'user_id,workspace_id' });
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push workspace pins', e) };
  }
}

// -----------------------------
// Realtime listeners
// -----------------------------

type ChangeCallback<T> = (payload: { event: 'INSERT' | 'UPDATE' | 'DELETE'; newRow: T | null; oldRow: T | null }) => void;

function toEvent(e: string): 'INSERT' | 'UPDATE' | 'DELETE' {
  if (e === 'INSERT' || e === 'UPDATE' || e === 'DELETE') return e;
  return 'UPDATE';
}

export function subscribeToNotes(workspaceId: string, cb: ChangeCallback<Note>) {
  if (!getCanUseSupabase()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel(`notes:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${workspaceId}` },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Note) ?? null, oldRow: (p.old as Note) ?? null }),
    )
    .subscribe();

  return () => sb.removeChannel(channel);
}

export function subscribeToCategories(workspaceId: string, cb: ChangeCallback<Category>) {
  if (!getCanUseSupabase()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel(`categories:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: `workspace_id=eq.${workspaceId}` },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Category) ?? null, oldRow: (p.old as Category) ?? null }),
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

export function subscribeToWorkspaces(cb: ChangeCallback<Workspace>) {
  if (!getCanUseSupabase()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel('workspaces')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspaces' },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Workspace) ?? null, oldRow: (p.old as Workspace) ?? null }),
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

export function subscribeToWorkspacePins(cb: ChangeCallback<WorkspacePin>) {
  if (!getCanUseSupabase()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel('workspace_pins')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspace_pins' },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as WorkspacePin) ?? null, oldRow: (p.old as WorkspacePin) ?? null }),
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

// -----------------------------
// Full Sync Orchestrator
// -----------------------------

const FULL_SYNC_MAX_PK_RETRIES = 2;

export async function fullSync(
  workspaceIds?: string[],
  pkRetryDepth = 0,
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) {
    return { ok: true };
  }

  if (pkRetryDepth > FULL_SYNC_MAX_PK_RETRIES) {
    return {
      ok: false,
      error: mkError('Could not publish workspaces after re-assigning ids. Try again.', new Error()),
    };
  }

  let syncSucceeded = false;

  try {
    const ownerId = await getOwnerId();

    // 1) Pull remote workspaces (required behavior: direct select)
    const remoteWorkspacesRes = await getSupabase().from('workspaces').select('*');
    if (remoteWorkspacesRes.error) {
      return {
        ok: false,
        error: mkError(remoteWorkspacesRes.error.message, remoteWorkspacesRes.error),
      };
    }
    const remoteWorkspaces = (remoteWorkspacesRes.data || []) as Workspace[];

    // Pull remote pins (workspace_pins is owned via RLS)
    const remotePins = await pullWorkspacePins();
    if (remotePins.error) return { ok: false, error: remotePins.error };

    // 1b) Ensure every remote workspace has a storageKey mapping + UI blob (for post-wipe UI hydration).
    // We also force the canonical visible key scheme for remote visible workspaces: ws_visible_<uuid>.
    for (const rw of remoteWorkspaces) {
      if (!rw?.id) continue;
      const storageKey =
        rw.kind === 'visible' && (rw.name || '').trim().toLowerCase() !== 'home'
          ? `ws_visible_${rw.id}`
          : rw.kind === 'visible' && (rw.name || '').trim().toLowerCase() === 'home'
            ? 'workspace_home'
            : `workspace_${(rw.name || 'workspace')
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '') || 'workspace'}_${String(rw.id).replace(/-/g, '').slice(0, 12)}`;
      setWorkspaceIdMapping(storageKey, rw.id);
      ensureWorkspaceUiBlob(storageKey);
    }

    // 2) Load local workspaces
    const localWorkspaces = await getLocalWorkspaces();

    // 3) Merge with REMOTE priority:
    // - If workspace exists remotely -> use remote version
    // - If exists only locally -> keep (offline-created)
    const localById = new Map(localWorkspaces.map((w) => [w.id, w]));
    const remoteIds = new Set(remoteWorkspaces.map((w) => w.id));
    const mergedWorkspaces: Workspace[] = [];
    for (const rw of remoteWorkspaces) mergedWorkspaces.push(rw);
    for (const [id, lw] of localById.entries()) {
      if (!remoteIds.has(id)) mergedWorkspaces.push(lw);
    }

    const mergedAfterNumberedPrune = ownerId
      ? await pruneRedundantNumberedVisibleWorkspaces(mergedWorkspaces)
      : mergedWorkspaces;

    // owner_id + unique (owner, name)–safe labels before local save and push
    const mergedWorkspacesWithOwner = ownerId
      ? prepareWorkspacesForRemote(mergedAfterNumberedPrune, ownerId)
      : mergedAfterNumberedPrune;

    // 4) ALWAYS write merged workspaces back to local storage (hydration)
    await saveLocalWorkspaces(mergedWorkspacesWithOwner);

    // 4b) Rebuild storage-key ↔ UUID bindings and Menu-visible workspace list (e.g. after local wipe)
    bindMergedWorkspacesToStorageKeys(mergedWorkspacesWithOwner);
    const nextVisible = rebuildVisibleWorkspacesFromRemote(mergedWorkspacesWithOwner);
    const appPrev = loadAppState();
    const mergedIds = new Set(mergedWorkspacesWithOwner.map((w) => w.id));
    let lastActive = appPrev.lastActiveStorageKey;
    const visPrefix = 'ws_visible_';
    if (lastActive.startsWith(visPrefix)) {
      const wid = lastActive.slice(visPrefix.length);
      if (!mergedIds.has(wid)) lastActive = 'workspace_home';
    }
    saveAppState(nextVisible, lastActive);

    // Ensure every merged workspace has a UI blob key present
    for (const w of mergedWorkspacesWithOwner) {
      if (!w?.id) continue;
      const key =
        w.kind === 'visible' && (w.name || '').trim().toLowerCase() !== 'home'
          ? `ws_visible_${w.id}`
          : w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
            ? 'workspace_home'
            : undefined;
      if (key) ensureWorkspaceUiBlob(key);
    }

    // 5) Determine workspace IDs for downstream pulls/merges
    const ids =
      workspaceIds && workspaceIds.length
        ? workspaceIds
        : mergedWorkspacesWithOwner.map((w) => w.id);

    const remoteCategories: Record<string, Category[]> = {};
    const remoteNotes: Record<string, Note[]> = {};
    const remoteArchived: Record<string, ArchivedNote[]> = {};

    for (const wid of ids) {
      const [cats, notes, arch] = await Promise.all([
        pullCategories(wid),
        pullNotes(wid),
        pullArchivedNotes(wid),
      ]);
      if (cats.error) return { ok: false, error: cats.error };
      if (notes.error) return { ok: false, error: notes.error };
      if (arch.error) return { ok: false, error: arch.error };
      remoteCategories[wid] = cats.data;
      remoteNotes[wid] = notes.data;
      remoteArchived[wid] = arch.data;
    }

    // Seed merged categories into local DB before UI flush (so name → category_id mapping sees remote rows)
    for (const wid of ids) {
      const localCatsSeed = await getLocalCategories(wid);
      const mergedCatSeed = mergeCategories(localCatsSeed, remoteCategories[wid] || []);
      await saveLocalCategories(wid, mergedCatSeed.merged);
    }

    for (const wid of ids) {
      await flushWorkspaceUiIntoLocalDb(wid);
    }

    // Load local (normalize user_id before merge so dev-session pins dedupe with remote)
    const localPinsRaw = await getLocalWorkspacePins();
    const localPins =
      ownerId != null ? ensureWorkspacePinUserId(localPinsRaw, ownerId) : localPinsRaw;
    const localCategories: Record<string, Category[]> = {};
    const localNotes: Record<string, Note[]> = {};
    const localArchived: Record<string, ArchivedNote[]> = {};
    const localNoteTombstones: Record<string, { id: string; deleted_at: string }[]> = {};
    const localArchivedTombstones: Record<string, { id: string; deleted_at: string }[]> = {};

    for (const wid of ids) {
      const [cats, notes, arch, tombs, archTombs] = await Promise.all([
        getLocalCategories(wid),
        getLocalNotes(wid),
        getLocalArchivedNotes(wid),
        getLocalNoteTombstones(wid),
        getLocalArchivedNoteTombstones(wid),
      ]);
      localCategories[wid] = cats;
      localNotes[wid] = notes;
      localArchived[wid] = arch;
      localNoteTombstones[wid] = tombs;
      localArchivedTombstones[wid] = archTombs;
    }

    // Merge
    const remotePinsList = remotePins.data || [];
    const remotePinsForMerge =
      ownerId != null ? ensureWorkspacePinUserId(remotePinsList, ownerId) : remotePinsList;
    const mergedPins = mergeWorkspacePins(localPins, remotePinsForMerge);

    const mergedCategories: Record<string, ReturnType<typeof mergeCategories>> = {};
    const mergedNotes: Record<string, ReturnType<typeof mergeNotes>> = {};
    const mergedArchived: Record<string, ReturnType<typeof mergeArchivedNotes>> = {};

    for (const wid of ids) {
      mergedCategories[wid] = mergeCategories(localCategories[wid] || [], remoteCategories[wid] || []);
      mergedNotes[wid] = mergeNotes(localNotes[wid] || [], remoteNotes[wid] || []);
      mergedArchived[wid] = mergeArchivedNotes(localArchived[wid] || [], remoteArchived[wid] || []);
    }

    // Apply tombstones: locally deleted notes must not be resurrected by remote merges.
    for (const wid of ids) {
      const tombIds = new Set((localNoteTombstones[wid] || []).map((t) => t.id));
      if (tombIds.size === 0) continue;
      mergedNotes[wid] = {
        ...mergedNotes[wid],
        merged: mergedNotes[wid].merged.filter((n) => !tombIds.has(n.id)),
      };
    }

    // Apply tombstones: locally deleted archived notes must not be resurrected by remote merges.
    for (const wid of ids) {
      const tombIds = new Set((localArchivedTombstones[wid] || []).map((t) => t.id));
      if (tombIds.size === 0) continue;
      mergedArchived[wid] = {
        ...mergedArchived[wid],
        merged: mergedArchived[wid].merged.filter((n) => !tombIds.has(n.id)),
      };
    }

    // Save local merged for the rest of tables (workspaces already persisted above)
    await saveLocalWorkspacePins(mergedPins.merged);
    for (const wid of ids) {
      await Promise.all([
        saveLocalCategories(wid, mergedCategories[wid].merged),
        saveLocalNotes(wid, mergedNotes[wid].merged),
        saveLocalArchivedNotes(wid, mergedArchived[wid].merged),
      ]);
    }

    for (const wid of ids) {
      await hydrateWorkspaceUiFromLocalDb(wid);
    }

    // Push merged (ensure category FK order: categories before notes)
    const wsPush = await pushWorkspaces(mergedWorkspacesWithOwner, remoteIds);
    if (!wsPush.ok) return { ok: false, error: wsPush.error };
    if (
      wsPush.ok &&
      wsPush.workspaceIdReplacements &&
      Object.keys(wsPush.workspaceIdReplacements).length > 0
    ) {
      const again = await fullSync(workspaceIds, pkRetryDepth + 1);
      syncSucceeded = again.ok;
      return again;
    }

    const pinsPush = await pushWorkspacePins(mergedPins.merged);
    if (!pinsPush.ok) return { ok: false, error: pinsPush.error };

    for (const wid of ids) {
      const cats = mergedCategories[wid].merged;
      const notesAligned = alignNoteCategoryIds(mergedNotes[wid].merged, cats);
      const archAligned = alignArchivedNoteCategoryIds(mergedArchived[wid].merged, cats);

      const delIds = (localNoteTombstones[wid] || []).map((t) => t.id);
      const delRes = await pushNoteDeletes(wid, delIds);
      if (!delRes.ok) return { ok: false, error: delRes.error };

      const archDelIds = (localArchivedTombstones[wid] || []).map((t) => t.id);
      const archDelRes = await pushArchivedDeletes(wid, archDelIds);
      if (!archDelRes.ok) return { ok: false, error: archDelRes.error };

      const catRes = await pushCategories(cats);
      if (!catRes.ok) return { ok: false, error: catRes.error };

      const noteRes = await pushNotes(notesAligned);
      if (!noteRes.ok) return { ok: false, error: noteRes.error };

      const archRes = await pushArchivedNotes(archAligned);
      if (!archRes.ok) return { ok: false, error: archRes.error };

      // Clear tombstones after successful remote deletes.
      if (delIds.length) await saveLocalNoteTombstones(wid, []);
      if (archDelIds.length) await saveLocalArchivedNoteTombstones(wid, []);
    }

    syncSucceeded = true;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Full sync failed', e) };
  } finally {
    notifyHydrationComplete({ ok: syncSucceeded });
  }
}

