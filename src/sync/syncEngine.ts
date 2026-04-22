import type {
  ArchivedNote,
  Category,
  CategoryTombstone,
  Note,
  SyncError,
  Workspace,
  WorkspacePin,
} from './types';
import { archivedNoteTagRowsFromArchived, noteTagRowsFromNotes } from './tagSync';
import {
  getSupabase,
  fetchArchivedNotes,
  fetchCategories,
  fetchNotes,
  fetchWorkspacePins,
} from './supabaseClient';
import {
  clearLocalWorkspaceData,
  getLastKnownRemoteNoteIds,
  getLocalArchivedNoteTags,
  getLocalArchivedNotes,
  getLocalArchivedNoteTombstones,
  getLocalCategories,
  getLocalCategoryTombstones,
  getLocalNoteTags,
  getLocalNoteTombstones,
  getLocalNotes,
  getLocalWorkspaces,
  getLocalWorkspacePins,
  saveLocalArchivedNoteTags,
  saveLocalArchivedNotes,
  saveLocalCategories,
  saveLocalCategoryTombstones,
  saveLocalArchivedNoteTombstones,
  saveLocalNoteTags,
  saveLastKnownRemoteNoteIds,
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
  getOrCreateWorkspaceIdForStorageKey,
  getStorageKeyForWorkspaceId,
  isUuid,
  loadAppState,
  collectMergedWorkspaceStorageKeys,
  purgeOrphanWorkspaceBlobsFromLocalStorage,
  rebuildVisibleWorkspacesFromRemote,
  removeWorkspaceIdMapping,
  saveAppState,
  setWorkspaceIdMapping,
} from '../utils/storage';
import { notifyHydrationComplete } from './hydrationBridge';
import { getCanUseSupabase } from './syncEnabled';
import { getSession as getLocalSession } from '../auth/localSession';
import { pruneArchivedNoteRows } from '../utils/archivedPrune';
import { listWorkspaceShares } from './sharedWorkspaces';

function mkError(message: string, details?: unknown): SyncError {
  return { message, details };
}

async function getOwnerId(): Promise<string | null> {
  if (!getCanUseSupabase()) return null;
  return getLocalSession().userId;
}

function ensureWorkspacePinUserId(pins: WorkspacePin[], userId: string): WorkspacePin[] {
  return pins.map((p) => ({ ...p, user_id: userId }));
}

function keepWorkspaceOwnerIds(local: Workspace[], remote: Workspace[]): Workspace[] {
  const ownerById = new Map<string, string>();
  for (const w of remote || []) {
    if (!w?.id) continue;
    ownerById.set(w.id, w.owner_id);
  }
  return (local || []).map((w) => {
    if (!w?.id) return w;
    const owner = ownerById.get(w.id);
    return owner ? { ...w, owner_id: owner } : w;
  });
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

function prepareWorkspacesForRemote(rows: Workspace[]): Workspace[] {
  return disambiguateWorkspaceNamesForPush(rows);
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
  const ct = await getLocalCategoryTombstones(oldId);
  const noteTags = await getLocalNoteTags(oldId);
  const archivedNoteTags = await getLocalArchivedNoteTags(oldId);

  const rewriteWs = <T extends { workspace_id: string }>(rows: T[]): T[] =>
    rows.map((r) => ({ ...r, workspace_id: newId }));

  await saveLocalCategories(newId, rewriteWs(cats));
  await saveLocalNotes(newId, rewriteWs(notes));
  await saveLocalArchivedNotes(newId, rewriteWs(arch));
  await saveLocalNoteTombstones(newId, rewriteWs(nt));
  await saveLocalArchivedNoteTombstones(newId, rewriteWs(at));
  await saveLocalCategoryTombstones(newId, rewriteWs(ct) as CategoryTombstone[]);
  await saveLocalNoteTags(newId, noteTags);
  await saveLocalArchivedNoteTags(newId, archivedNoteTags);

  try {
    localStorage.removeItem(`plainsight_local_categories_${oldId}`);
    localStorage.removeItem(`plainsight_local_notes_${oldId}`);
    localStorage.removeItem(`plainsight_local_archived_${oldId}`);
    localStorage.removeItem(`plainsight_local_note_tombstones_${oldId}`);
    localStorage.removeItem(`plainsight_local_category_tombstones_${oldId}`);
    localStorage.removeItem(`plainsight_local_archived_tombstones_${oldId}`);
    localStorage.removeItem(`plainsight_local_note_tags_${oldId}`);
    localStorage.removeItem(`plainsight_local_archived_note_tags_${oldId}`);
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
    const rows = prepareWorkspacesForRemote(localWorkspaces);
    const ownedRows = rows.filter((w) => String(w.owner_id || '') === String(ownerId));
    const seen = workspaceIdsSeenOnRemote;
    const toUpsert = ownedRows.filter((w) => w.id && seen.has(w.id));
    const toInsert = ownedRows.filter((w) => w.id && !seen.has(w.id));

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
            const nextVisible = rebuildVisibleWorkspacesFromRemote(list, ownerId);
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

export type DeleteWorkspaceRemoteOptions = {
  /** When false (default), treat "0 rows deleted" as failure so callers can surface a real error. */
  allowZeroRows?: boolean;
  /**
   * When true (default), delete notes / archived / categories / pins for this workspace first so
   * FK constraints cannot block the workspace row delete.
   */
  cascadeChildren?: boolean;
};

/** Notes before categories (category_id FK). RLS scopes rows to workspace ownership. */
async function deleteWorkspaceChildrenRemote(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  const sb = getSupabase();
  const { error: nErr } = await sb.from('notes').delete().eq('workspace_id', workspaceId);
  if (nErr) return { ok: false, error: mkError(nErr.message, nErr) };
  const { error: aErr } = await sb.from('archived_notes').delete().eq('workspace_id', workspaceId);
  if (aErr) return { ok: false, error: mkError(aErr.message, aErr) };
  const { error: cErr } = await sb.from('categories').delete().eq('workspace_id', workspaceId);
  if (cErr) return { ok: false, error: mkError(cErr.message, cErr) };
  const { error: pErr } = await sb.from('workspace_pins').delete().eq('workspace_id', workspaceId);
  if (pErr) return { ok: false, error: mkError(pErr.message, pErr) };
  return { ok: true };
}

/**
 * Delete one workspace row for the signed-in user (RLS).
 * Uses `.select()` so PostgREST returns how many rows were removed; otherwise "success" with 0
 * rows is easy to mistake for a real delete.
 */
export async function deleteWorkspaceRemote(
  workspaceId: string,
  options?: DeleteWorkspaceRemoteOptions,
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    /** Current signed-in user id (local session); must match `workspaces.owner_id` to delete remotely. */
    const sessionUserId = await getOwnerId();
    if (!sessionUserId) return { ok: true };
    if (!workspaceId || typeof workspaceId !== 'string') {
      return { ok: false, error: mkError('Missing workspace id', new Error()) };
    }
    const allowZero = options?.allowZeroRows === true;
    const cascadeChildren = options?.cascadeChildren !== false;

    const { data: ownedWorkspace, error: ownedErr } = await getSupabase()
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('owner_id', sessionUserId)
      .maybeSingle();

    if (ownedErr) return { ok: false, error: mkError(ownedErr.message, ownedErr) };
    if (!ownedWorkspace?.id) {
      return {
        ok: false,
        error: mkError(
          'Only the workspace owner can delete this workspace from the server.',
          new Error('delete_workspace_not_owner'),
        ),
      };
    }

    if (cascadeChildren) {
      const ch = await deleteWorkspaceChildrenRemote(workspaceId);
      if (!ch.ok) return ch;
    }

    const res = await getSupabase().from('workspaces').delete().eq('id', workspaceId).select('id');
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    const n = Array.isArray(res.data) ? res.data.length : 0;
    if (!allowZero && n < 1) {
      return {
        ok: false,
        error: mkError(
          'Workspace was not deleted (no matching row). Check sync and try again.',
          new Error('delete_workspace_zero_rows'),
        ),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to delete workspace', e) };
  }
}

/** Matches `disambiguateWorkspaceNamesForPush`: "Name (2)" or "Name(2)". */
const NUMBERED_VISIBLE_NAME = /^(.+?)\s*\((\d+)\)\s*$/;

export type NumberedVisiblePruneOpts = {
  /**
   * When two duplicate "Home" rows both already exist on the server, disambiguation order is
   * arbitrary; keep this id (typically `workspace_home`'s mapped UUID) even if it was suffixed
   * to "Home (2)".
   */
  preferredHomeWorkspaceId?: string | null;
  /** IDs from the latest remote `workspaces` SELECT used with `preferredHomeWorkspaceId`. */
  remoteWorkspaceIdSet?: ReadonlySet<string> | null;
};

export function findRedundantNumberedVisibleWorkspaceIds(
  workspaces: Workspace[],
  opts?: NumberedVisiblePruneOpts | null,
): string[] {
  const visible = workspaces.filter(
    (w) =>
      w?.id &&
      w.kind === 'visible' &&
      (w.name || '').trim().toLowerCase() !== 'home',
  );
  const canonicalNamesLower = new Set<string>();
  /** Canonical tab uses name "Home" but is excluded from `visible` above — still suppresses "Home (2)". */
  const hasCanonicalHome = workspaces.some(
    (w) => w?.id && w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home',
  );
  if (hasCanonicalHome) canonicalNamesLower.add('home');
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

  const pref = (opts?.preferredHomeWorkspaceId || '').trim();
  const remoteSet = opts?.remoteWorkspaceIdSet;
  if (pref && remoteSet && remoteSet.size > 0 && removeIds.includes(pref)) {
    const bareCompetitor = workspaces.find(
      (w) =>
        w?.id &&
        w.kind === 'visible' &&
        (w.name || '').trim().toLowerCase() === 'home' &&
        w.id !== pref,
    );
    if (bareCompetitor && remoteSet.has(pref) && remoteSet.has(bareCompetitor.id)) {
      const idx = removeIds.indexOf(pref);
      removeIds[idx] = bareCompetitor.id;
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
  opts?: NumberedVisiblePruneOpts | null,
): Promise<Workspace[]> {
  const removeIds = findRedundantNumberedVisibleWorkspaceIds(workspaces, opts);
  if (removeIds.length === 0) return workspaces;
  const succeeded = new Set<string>();
  for (const id of removeIds) {
    const del = await deleteWorkspaceRemote(id, {
      allowZeroRows: true,
      cascadeChildren: true,
    });
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

export async function pushCategoryDeletes(
  workspaceId: string,
  categoryIds: string[],
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const ids = (categoryIds || []).filter((id) => isUuid(id));
    if (ids.length === 0) return { ok: true };
    const res = await getSupabase().from('categories').delete().in('id', ids).select('*');
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to delete categories', e) };
  }
}

function sanitizeNotesForPush(rows: Note[]): Note[] {
  const out: Note[] = [];
  for (const row of rows) {
    if (!isUuid(row.workspace_id || '')) {
      console.warn('pushNotes: skipping note with invalid workspace_id', row);
      continue;
    }
    const { bold_first_line: bfl, ...rest } = row;
    const cleaned: Note =
      bfl === true ? { ...rest, bold_first_line: true } : { ...rest };
    if (!isUuid(row.id || '')) {
      console.warn('pushNotes: regenerating invalid note id', row);
      out.push({ ...cleaned, id: uuidv4() });
      continue;
    }
    out.push(cleaned);
  }
  return out;
}

/** PostgREST: column not in schema cache (migration not applied yet). */
function isMissingBoldFirstLineColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'PGRST204' && String(err.message || '').includes('bold_first_line')) return true;
  return String(err.message || '').includes("Could not find the 'bold_first_line' column");
}

function stripBoldFirstLineForPush(rows: Note[]): Note[] {
  return rows.map((row) => {
    const { bold_first_line: _b, ...rest } = row;
    return rest as Note;
  });
}

export async function pushNotes(localNotes: Note[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  if (!getCanUseSupabase()) return { ok: true };
  try {
    const notesToPush = sanitizeNotesForPush(localNotes);
    let res = await getSupabase().from('notes').upsert(notesToPush, { onConflict: 'id' }).select('*');
    if (res.error && isMissingBoldFirstLineColumnError(res.error)) {
      console.warn(
        '[pushNotes] Remote notes table has no bold_first_line; retrying without it. Apply supabase/migrations/20260419120000_notes_bold_first_line.sql to sync that field.',
      );
      res = await getSupabase()
        .from('notes')
        .upsert(stripBoldFirstLineForPush(notesToPush), { onConflict: 'id' })
        .select('*');
    }
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

export type PushNoteDeletesResult =
  | { ok: true; deletedIds: string[] }
  | { ok: false; error: SyncError };

export async function pushNoteDeletes(
  workspaceId: string,
  noteIds: string[],
): Promise<PushNoteDeletesResult> {
  if (!getCanUseSupabase()) return { ok: true, deletedIds: [] };
  try {
    const ids = (noteIds || []).filter((id) => isUuid(id));
    if (ids.length === 0) return { ok: true, deletedIds: [] };
    const res = await getSupabase().from('notes').delete().in('id', ids).select('*');
    console.log('pushNoteDeletes result:', { workspaceId, ...res });
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    const deletedIds = ((res.data as { id?: string }[]) || [])
      .map((r) => (typeof r?.id === 'string' ? r.id : ''))
      .filter(Boolean);
    if (ids.length > 0 && deletedIds.length === 0) {
      return {
        ok: false,
        error: mkError(
          'Notes were not deleted on the server (no rows removed). Check permissions or session.',
          new Error('push_note_deletes_zero_rows'),
        ),
      };
    }
    return { ok: true, deletedIds };
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

/**
 * Indirection used by `fullSync` for pull/push entry points. Vitest can
 * `vi.spyOn(fullSyncIpc, 'pullCategories')` and affect orchestration; spying the co-exported
 * `pullCategories` function does not (ESM keeps direct call bindings).
 */
export const fullSyncIpc = {
  pullWorkspacePins,
  pullCategories,
  pullNotes,
  pullArchivedNotes,
  pushWorkspaces,
  pushWorkspacePins,
  pushCategories,
  pushNotes,
  pushArchivedNotes,
  pushNoteDeletes,
  pushArchivedDeletes,
  pushCategoryDeletes,
};

// -----------------------------
// Realtime listeners
// -----------------------------

type ChangeCallback<T> = (payload: { event: 'INSERT' | 'UPDATE' | 'DELETE'; newRow: T | null; oldRow: T | null }) => void;

function toEvent(e: string): 'INSERT' | 'UPDATE' | 'DELETE' {
  if (e === 'INSERT' || e === 'UPDATE' || e === 'DELETE') return e;
  return 'UPDATE';
}

function subscribeWorkspacePostgresTable<T>(
  channelName: string,
  table: string,
  filter: string,
  cb: ChangeCallback<T>,
) {
  const sb = getSupabase();
  const channel = sb
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter },
      (p) =>
        cb({
          event: toEvent(p.eventType),
          newRow: (p.new as T) ?? null,
          oldRow: (p.old as T) ?? null,
        }),
    )
    .subscribe();
  return () => sb.removeChannel(channel);
}

export function subscribeToNotes(workspaceId: string, cb: ChangeCallback<Note>) {
  if (!getCanUseSupabase()) return () => {};
  return subscribeWorkspacePostgresTable<Note>(
    `workspace:${workspaceId}:notes`,
    'notes',
    `workspace_id=eq.${workspaceId}`,
    cb,
  );
}

export function subscribeToCategories(workspaceId: string, cb: ChangeCallback<Category>) {
  if (!getCanUseSupabase()) return () => {};
  return subscribeWorkspacePostgresTable<Category>(
    `workspace:${workspaceId}:categories`,
    'categories',
    `workspace_id=eq.${workspaceId}`,
    cb,
  );
}

export function subscribeToArchivedNotes(workspaceId: string, cb: ChangeCallback<ArchivedNote>) {
  if (!getCanUseSupabase()) return () => {};
  return subscribeWorkspacePostgresTable<ArchivedNote>(
    `workspace:${workspaceId}:archived_notes`,
    'archived_notes',
    `workspace_id=eq.${workspaceId}`,
    cb,
  );
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

/** Remote rows take precedence when the same workspace id exists on both sides (hydration merge). */
export function mergeRemoteAndLocalWorkspaces(
  remote: Workspace[],
  local: Workspace[],
): Workspace[] {
  const localById = new Map(local.map((w) => [w.id, w]));
  const remoteIdSet = new Set(remote.map((w) => w.id));
  const merged: Workspace[] = [...remote];
  for (const [id, lw] of localById.entries()) {
    if (!remoteIdSet.has(id)) merged.push(lw);
  }
  return merged;
}

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
  let hydrationFailure: SyncError | null = null;

  const fail = (error: SyncError) => {
    hydrationFailure = error;
    return { ok: false as const, error };
  };

  try {
    const ownerId = await getOwnerId();

    // Pull pins first (does not depend on workspace list).
    const remotePins = await fullSyncIpc.pullWorkspacePins();
    if (remotePins.error) return fail(remotePins.error);

    // Fetch remote + local together, merge, prune, then persist in one tight sequence so we never
    // write a workspace list from a stale remote snapshot (e.g. user deleted rows while sync ran).
    const [remoteWorkspacesRes, localWorkspaces] = await Promise.all([
      getSupabase().from('workspaces').select('*'),
      getLocalWorkspaces(),
    ]);
    if (remoteWorkspacesRes.error) {
      return fail(mkError(remoteWorkspacesRes.error.message, remoteWorkspacesRes.error));
    }
    const remoteWorkspaces = (remoteWorkspacesRes.data || []) as Workspace[];
    let mergedWorkspaces = mergeRemoteAndLocalWorkspaces(remoteWorkspaces, localWorkspaces);
    if (ownerId) {
      mergedWorkspaces = keepWorkspaceOwnerIds(mergedWorkspaces, remoteWorkspaces);
    }

    let mergedAfterNumberedPrune = ownerId
      ? await pruneRedundantNumberedVisibleWorkspaces(mergedWorkspaces)
      : mergedWorkspaces;

    let mergedWorkspacesWithOwner = ownerId
      ? prepareWorkspacesForRemote(mergedAfterNumberedPrune)
      : mergedAfterNumberedPrune;

    // Second snapshot after prune/prepare: those steps can take long enough that the user finishes
    // deletes (or another tab completes sync) before we persist — do not resurrect deleted rows.
    const [remoteFinalRes, localFinal] = await Promise.all([
      getSupabase().from('workspaces').select('*'),
      getLocalWorkspaces(),
    ]);
    if (remoteFinalRes.error) {
      return fail(mkError(remoteFinalRes.error.message, remoteFinalRes.error));
    }
    const remoteFinal = (remoteFinalRes.data || []) as Workspace[];
    mergedWorkspaces = mergeRemoteAndLocalWorkspaces(remoteFinal, localFinal);
    if (ownerId) {
      mergedWorkspaces = keepWorkspaceOwnerIds(mergedWorkspaces, remoteFinal);
    }
    mergedAfterNumberedPrune = ownerId
      ? await pruneRedundantNumberedVisibleWorkspaces(mergedWorkspaces)
      : mergedWorkspaces;
    mergedWorkspacesWithOwner = ownerId
      ? prepareWorkspacesForRemote(mergedAfterNumberedPrune)
      : mergedAfterNumberedPrune;
    const remoteIds = new Set(remoteFinal.map((w) => w.id));
    // `disambiguateWorkspaceNamesForPush` runs inside prepare and suffixes duplicate labels
    // ("Home" + "Home (2)"). Pre-prepare prune only sees duplicate bare names, so it must run
    // again here or the menu briefly shows "Home (2)" until a later fullSync.
    if (ownerId) {
      mergedWorkspacesWithOwner = await pruneRedundantNumberedVisibleWorkspaces(
        mergedWorkspacesWithOwner,
        {
          preferredHomeWorkspaceId: getOrCreateWorkspaceIdForStorageKey('workspace_home'),
          remoteWorkspaceIdSet: remoteIds,
        },
      );
      const homeBoundId = getOrCreateWorkspaceIdForStorageKey('workspace_home');
      mergedWorkspacesWithOwner = mergedWorkspacesWithOwner.map((w) => {
        if (!w || w.id !== homeBoundId || w.kind !== 'visible') return w;
        const nm = (w.name || '').trim();
        if (/^home\s*\(\d+\)$/i.test(nm)) return { ...w, name: 'Home' };
        return w;
      });
    }

    const myAccessibleWorkspaceIds = new Set<string>();
    if (ownerId) {
      const shareRes = await listWorkspaceShares();
      if (shareRes.error) {
        return fail(mkError(shareRes.error.message, shareRes.error.details));
      }
      for (const s of shareRes.data || []) {
        if (s.status !== 'accepted') continue;
        if (String(s.owner_id || '') === String(ownerId)) {
          myAccessibleWorkspaceIds.add(String(s.workspace_id));
          continue;
        }
        if (String(s.recipient_user_id || '') === String(ownerId)) {
          myAccessibleWorkspaceIds.add(String(s.workspace_id));
        }
      }
      for (const w of mergedWorkspacesWithOwner) {
        if (String(w.owner_id || '') === String(ownerId)) {
          myAccessibleWorkspaceIds.add(String(w.id));
        }
      }
      mergedWorkspacesWithOwner = mergedWorkspacesWithOwner.filter((w) =>
        myAccessibleWorkspaceIds.has(String(w.id)),
      );
    }

    // 4) ALWAYS write merged workspaces back to local storage (hydration)
    await saveLocalWorkspaces(mergedWorkspacesWithOwner);

    // 4b) Rebuild storage-key ↔ UUID bindings and Menu-visible workspace list (e.g. after local wipe)
    bindMergedWorkspacesToStorageKeys(mergedWorkspacesWithOwner);
    const mergedStorageKeys = collectMergedWorkspaceStorageKeys(
      mergedWorkspacesWithOwner,
    );
    purgeOrphanWorkspaceBlobsFromLocalStorage(mergedWorkspacesWithOwner, mergedStorageKeys);
    const nextVisible = rebuildVisibleWorkspacesFromRemote(mergedWorkspacesWithOwner, ownerId);
    const appPrev = loadAppState();
    const mergedIds = new Set(mergedWorkspacesWithOwner.map((w) => w.id));
    let lastActive = appPrev.lastActiveStorageKey;
    const visPrefix = 'ws_visible_';
    if (lastActive.startsWith(visPrefix)) {
      const wid = lastActive.slice(visPrefix.length);
      if (!mergedIds.has(wid)) lastActive = 'workspace_home';
    } else if (
      lastActive.startsWith('workspace_') &&
      lastActive !== 'workspace_home' &&
      !mergedStorageKeys.has(lastActive)
    ) {
      lastActive = 'workspace_home';
    }
    saveAppState(nextVisible, lastActive);

    // Owner always sees own workspaces; collaborators only sync accepted shared workspaces.
    // Ensure every merged workspace has a UI blob key present (includes hidden after bind).
    for (const w of mergedWorkspacesWithOwner) {
      if (!w?.id) continue;
      const key =
        w.kind === 'visible' && (w.name || '').trim().toLowerCase() !== 'home'
          ? `ws_visible_${w.id}`
          : w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
            ? 'workspace_home'
            : w.kind === 'hidden'
              ? getStorageKeyForWorkspaceId(w.id) ?? undefined
              : undefined;
      if (key) ensureWorkspaceUiBlob(key);
    }

    // 5) Determine workspace IDs for downstream pulls/merges
    let workspaceIdsToSync =
      workspaceIds && workspaceIds.length
        ? [...workspaceIds]
        : mergedWorkspacesWithOwner.map((w) => w.id);
    if (ownerId) {
      workspaceIdsToSync = workspaceIdsToSync.filter((wid) => myAccessibleWorkspaceIds.has(wid));
    }
    if (ownerId) {
      const idsToPurge = mergedWorkspaces
        .map((w) => String(w?.id || ''))
        .filter((wid) => wid && !myAccessibleWorkspaceIds.has(wid));
      for (const wid of idsToPurge) {
        await purgeWorkspaceClientSide(wid);
      }
    }

    const remoteCategories: Record<string, Category[]> = {};
    const remoteNotes: Record<string, Note[]> = {};
    const remoteArchived: Record<string, ArchivedNote[]> = {};

    for (const wid of workspaceIdsToSync) {
      const [cats, notes, arch] = await Promise.all([
        fullSyncIpc.pullCategories(wid),
        fullSyncIpc.pullNotes(wid),
        fullSyncIpc.pullArchivedNotes(wid),
      ]);
      if (cats.error) return fail(cats.error);
      if (notes.error) return fail(notes.error);
      if (arch.error) return fail(arch.error);
      remoteCategories[wid] = cats.data;
      remoteNotes[wid] = notes.data;
      remoteArchived[wid] = arch.data;
    }

    const lastKnownRemoteNoteIdsByWid: Record<string, Set<string>> = {};
    await Promise.all(
      workspaceIdsToSync.map(async (wid) => {
        lastKnownRemoteNoteIdsByWid[wid] = await getLastKnownRemoteNoteIds(wid);
      }),
    );

    // Seed merged categories into local DB before UI flush (so name → category_id mapping sees remote rows)
    for (const wid of workspaceIdsToSync) {
      const localCatsSeed = await getLocalCategories(wid);
      const mergedCatSeed = mergeCategories(localCatsSeed, remoteCategories[wid] || []);
      await saveLocalCategories(wid, mergedCatSeed.merged);
    }

    for (const wid of workspaceIdsToSync) {
      await flushWorkspaceUiIntoLocalDb(wid, {
        remoteIdsEverConfirmed: lastKnownRemoteNoteIdsByWid[wid],
        remoteNoteIdsThisPull: new Set((remoteNotes[wid] || []).map((n) => n.id)),
      });
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
    const localCategoryTombstones: Record<string, CategoryTombstone[]> = {};

    for (const wid of workspaceIdsToSync) {
      const [cats, notes, arch, tombs, archTombs, catTombs] = await Promise.all([
        getLocalCategories(wid),
        getLocalNotes(wid),
        getLocalArchivedNotes(wid),
        getLocalNoteTombstones(wid),
        getLocalArchivedNoteTombstones(wid),
        getLocalCategoryTombstones(wid),
      ]);
      localCategories[wid] = cats;
      localNotes[wid] = notes;
      localArchived[wid] = arch;
      localNoteTombstones[wid] = tombs;
      localArchivedTombstones[wid] = archTombs;
      localCategoryTombstones[wid] = catTombs;
    }

    // Merge
    const remotePinsList = remotePins.data || [];
    const remotePinsForMerge =
      ownerId != null ? ensureWorkspacePinUserId(remotePinsList, ownerId) : remotePinsList;
    const mergedPins = mergeWorkspacePins(localPins, remotePinsForMerge);

    const mergedCategories: Record<string, ReturnType<typeof mergeCategories>> = {};
    const mergedNotes: Record<string, ReturnType<typeof mergeNotes>> = {};
    const mergedArchived: Record<string, ReturnType<typeof mergeArchivedNotes>> = {};

    for (const wid of workspaceIdsToSync) {
      mergedCategories[wid] = mergeCategories(localCategories[wid] || [], remoteCategories[wid] || []);
      mergedNotes[wid] = mergeNotes(localNotes[wid] || [], remoteNotes[wid] || [], {
        remoteIdsEverConfirmed: lastKnownRemoteNoteIdsByWid[wid],
      });
      mergedArchived[wid] = mergeArchivedNotes(localArchived[wid] || [], remoteArchived[wid] || []);
    }

    // Apply tombstones: locally deleted notes must not be resurrected by remote merges.
    for (const wid of workspaceIdsToSync) {
      const tombIds = new Set((localNoteTombstones[wid] || []).map((t) => t.id));
      if (tombIds.size === 0) continue;
      mergedNotes[wid] = {
        ...mergedNotes[wid],
        merged: mergedNotes[wid].merged.filter((n) => !tombIds.has(n.id)),
      };
    }

    // Apply tombstones: locally deleted archived notes must not be resurrected by remote merges.
    for (const wid of workspaceIdsToSync) {
      const tombIds = new Set((localArchivedTombstones[wid] || []).map((t) => t.id));
      if (tombIds.size === 0) continue;
      mergedArchived[wid] = {
        ...mergedArchived[wid],
        merged: mergedArchived[wid].merged.filter((n) => !tombIds.has(n.id)),
      };
    }

    // Apply tombstones: locally deleted categories must not be resurrected by remote merges.
    for (const wid of workspaceIdsToSync) {
      const tombIds = new Set((localCategoryTombstones[wid] || []).map((t) => t.id));
      if (tombIds.size === 0) continue;
      mergedCategories[wid] = {
        ...mergedCategories[wid],
        merged: mergedCategories[wid].merged.filter((c) => !tombIds.has(c.id)),
      };
    }

    // Cap archived notes per workspace (newest kept); queue remote deletes for trimmed rows.
    for (const wid of workspaceIdsToSync) {
      const merged = mergedArchived[wid].merged;
      const { kept, removed } = pruneArchivedNoteRows(merged);
      if (removed.length === 0) continue;
      mergedArchived[wid] = { ...mergedArchived[wid], merged: kept };
      const deletedAt = new Date().toISOString();
      const removedIdSet = new Set(removed.map((r) => r.id));
      const pruneTombs = removed.map((r) => ({
        id: r.id,
        workspace_id: wid,
        deleted_at: deletedAt,
      }));
      const existingTombs = localArchivedTombstones[wid] || [];
      localArchivedTombstones[wid] = [
        ...pruneTombs,
        ...existingTombs.filter((t) => !removedIdSet.has(t.id)),
      ];
      await saveLocalArchivedNoteTombstones(wid, localArchivedTombstones[wid]);
    }

    // Save local merged for the rest of tables (workspaces already persisted above)
    await saveLocalWorkspacePins(mergedPins.merged);
    for (const wid of workspaceIdsToSync) {
      await Promise.all([
        saveLocalCategories(wid, mergedCategories[wid].merged),
        saveLocalNotes(wid, mergedNotes[wid].merged),
        saveLocalArchivedNotes(wid, mergedArchived[wid].merged),
      ]);
      await saveLocalNoteTags(wid, noteTagRowsFromNotes(mergedNotes[wid].merged));
      await saveLocalArchivedNoteTags(
        wid,
        archivedNoteTagRowsFromArchived(mergedArchived[wid].merged),
      );
    }

    for (const wid of workspaceIdsToSync) {
      await hydrateWorkspaceUiFromLocalDb(wid);
    }

    // Push merged (ensure category FK order: categories before notes)
    const wsPush = await fullSyncIpc.pushWorkspaces(mergedWorkspacesWithOwner, remoteIds);
    if (!wsPush.ok) return fail(wsPush.error);
    if (
      wsPush.ok &&
      wsPush.workspaceIdReplacements &&
      Object.keys(wsPush.workspaceIdReplacements).length > 0
    ) {
      const again = await fullSync(workspaceIds, pkRetryDepth + 1);
      syncSucceeded = again.ok;
      return again;
    }

    const pinsPush = await fullSyncIpc.pushWorkspacePins(mergedPins.merged);
    if (!pinsPush.ok) return fail(pinsPush.error);

    for (const wid of workspaceIdsToSync) {
      const cats = mergedCategories[wid].merged;

      const delIds = (localNoteTombstones[wid] || []).map((t) => t.id);
      const delRes = await fullSyncIpc.pushNoteDeletes(wid, delIds);
      if (!delRes.ok) return fail(delRes.error);
      if (delIds.length) {
        const removed = new Set(delRes.deletedIds);
        localNoteTombstones[wid] = (localNoteTombstones[wid] || []).filter((t) => !removed.has(t.id));
        await saveLocalNoteTombstones(wid, localNoteTombstones[wid]);
      }
      const tombIdsForUpsert = new Set((localNoteTombstones[wid] || []).map((t) => t.id));
      const notesAligned = alignNoteCategoryIds(
        mergedNotes[wid].merged.filter((n) => !tombIdsForUpsert.has(n.id)),
        cats,
      );
      const archAligned = alignArchivedNoteCategoryIds(mergedArchived[wid].merged, cats);

      const archDelIds = (localArchivedTombstones[wid] || []).map((t) => t.id);
      const archDelRes = await fullSyncIpc.pushArchivedDeletes(wid, archDelIds);
      if (!archDelRes.ok) return fail(archDelRes.error);

      const catRes = await fullSyncIpc.pushCategories(cats);
      if (!catRes.ok) return fail(catRes.error);

      const noteRes = await fullSyncIpc.pushNotes(notesAligned);
      if (!noteRes.ok) return fail(noteRes.error);

      const onServerNow = new Set((remoteNotes[wid] || []).map((n) => n.id));
      for (const n of notesAligned) onServerNow.add(n.id);
      await saveLastKnownRemoteNoteIds(wid, onServerNow);

      const archRes = await fullSyncIpc.pushArchivedNotes(archAligned);
      if (!archRes.ok) return fail(archRes.error);

      const catDelIds = (localCategoryTombstones[wid] || []).map((t) => t.id);
      const catDelRes = await fullSyncIpc.pushCategoryDeletes(wid, catDelIds);
      if (!catDelRes.ok) return fail(catDelRes.error);

      // Clear tombstones after successful remote deletes (note tombstones updated incrementally above).
      if (archDelIds.length) await saveLocalArchivedNoteTombstones(wid, []);
      if (catDelIds.length) await saveLocalCategoryTombstones(wid, []);
    }

    syncSucceeded = true;
    return { ok: true };
  } catch (e) {
    return fail(mkError('Full sync failed', e));
  } finally {
    notifyHydrationComplete({
      ok: syncSucceeded,
      ...(syncSucceeded
        ? null
        : {
            reason: 'sync_failed' as const,
            message: hydrationFailure?.message || 'Full sync failed',
            details: hydrationFailure?.details,
          }),
    });
  }
}

