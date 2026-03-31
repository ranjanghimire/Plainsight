import type {
  ArchivedNote,
  Category,
  Note,
  SyncError,
  Workspace,
  WorkspacePin,
} from './types';
import { supabase } from './supabaseClient';
import {
  fetchAllWorkspaces,
  fetchArchivedNotes,
  fetchCategories,
  fetchNotes,
  fetchWorkspacePins,
} from './supabaseClient';
import {
  getLocalArchivedNotes,
  getLocalCategories,
  getLocalNotes,
  getLocalWorkspaces,
  getLocalWorkspacePins,
  saveLocalArchivedNotes,
  saveLocalCategories,
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
  isUuid,
  loadAppState,
  setWorkspaceIdMapping,
  rebuildVisibleWorkspacesFromRemote,
  saveAppState,
} from '../utils/storage';

function mkError(message: string, details?: unknown): SyncError {
  return { message, details };
}

async function getOwnerId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function ensureWorkspaceOwnerId(workspaces: Workspace[], ownerId: string): Workspace[] {
  return workspaces.map((w) =>
    w.owner_id ? w : { ...w, owner_id: ownerId },
  );
}

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

export async function pushWorkspaces(localWorkspaces: Workspace[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return { ok: true };
    const rows = ensureWorkspaceOwnerId(localWorkspaces, ownerId);
    const { error } = await supabase
      .from('workspaces')
      .upsert(rows, { onConflict: 'id' });
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push workspaces', e) };
  }
}

export async function pushCategories(localCategories: Category[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  try {
    const { error } = await supabase
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
  try {
    const notesToPush = sanitizeNotesForPush(localNotes);
    const res = await supabase.from('notes').upsert(notesToPush, { onConflict: 'id' }).select('*');
    console.log('pushNotes result:', res);
    if (res.error) return { ok: false, error: mkError(res.error.message, res.error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push notes', e) };
  }
}

export async function pushArchivedNotes(localArchived: ArchivedNote[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  try {
    const { error } = await supabase
      .from('archived_notes')
      .upsert(localArchived, { onConflict: 'id' });
    if (error) return { ok: false, error: mkError(error.message, error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Failed to push archived notes', e) };
  }
}

export async function pushWorkspacePins(localPins: WorkspacePin[]): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  try {
    // PK is (user_id, workspace_id) so use that as conflict target
    const { error } = await supabase
      .from('workspace_pins')
      .upsert(localPins, { onConflict: 'user_id,workspace_id' });
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
  const channel = supabase
    .channel(`notes:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${workspaceId}` },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Note) ?? null, oldRow: (p.old as Note) ?? null }),
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToCategories(workspaceId: string, cb: ChangeCallback<Category>) {
  const channel = supabase
    .channel(`categories:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: `workspace_id=eq.${workspaceId}` },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Category) ?? null, oldRow: (p.old as Category) ?? null }),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToWorkspaces(cb: ChangeCallback<Workspace>) {
  const channel = supabase
    .channel('workspaces')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspaces' },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as Workspace) ?? null, oldRow: (p.old as Workspace) ?? null }),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToWorkspacePins(cb: ChangeCallback<WorkspacePin>) {
  const channel = supabase
    .channel('workspace_pins')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspace_pins' },
      (p) => cb({ event: toEvent(p.eventType), newRow: (p.new as WorkspacePin) ?? null, oldRow: (p.old as WorkspacePin) ?? null }),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// -----------------------------
// Full Sync Orchestrator
// -----------------------------

export async function fullSync(
  workspaceIds?: string[],
): Promise<{ ok: true } | { ok: false; error: SyncError }> {
  console.log("FULLSYNC START");

  try {
    const ownerId = await getOwnerId();

    // 1) Pull remote workspaces (required behavior: direct select)
    const remoteWorkspacesRes = await supabase.from('workspaces').select('*');
    if (remoteWorkspacesRes.error) {
      return {
        ok: false,
        error: mkError(remoteWorkspacesRes.error.message, remoteWorkspacesRes.error),
      };
    }
    const remoteWorkspaces = (remoteWorkspacesRes.data || []) as Workspace[];

    console.log("REMOTE WORKSPACES:", remoteWorkspaces);

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

    // Ensure merged workspaces have owner_id before saving locally (never let missing owner_id win)
    const mergedWorkspacesWithOwner =
      ownerId ? ensureWorkspaceOwnerId(mergedWorkspaces, ownerId) : mergedWorkspaces;

    // 4) ALWAYS write merged workspaces back to local storage (hydration)
    await saveLocalWorkspaces(mergedWorkspacesWithOwner);

    // 4b) Rebuild storage-key ↔ UUID bindings and Menu-visible workspace list (e.g. after local wipe)
    bindMergedWorkspacesToStorageKeys(mergedWorkspacesWithOwner);
    const nextVisible = rebuildVisibleWorkspacesFromRemote(mergedWorkspacesWithOwner);
    const appPrev = loadAppState();
    saveAppState(nextVisible, appPrev.lastActiveStorageKey);

    console.log("AFTER HYDRATION:", mergedWorkspaces);

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

    // Load local
    const localPins = await getLocalWorkspacePins();
    const localCategories: Record<string, Category[]> = {};
    const localNotes: Record<string, Note[]> = {};
    const localArchived: Record<string, ArchivedNote[]> = {};

    for (const wid of ids) {
      const [cats, notes, arch] = await Promise.all([
        getLocalCategories(wid),
        getLocalNotes(wid),
        getLocalArchivedNotes(wid),
      ]);
      localCategories[wid] = cats;
      localNotes[wid] = notes;
      localArchived[wid] = arch;
    }

    // Merge
    const mergedPins = mergeWorkspacePins(localPins, remotePins.data);

    const mergedCategories: Record<string, ReturnType<typeof mergeCategories>> = {};
    const mergedNotes: Record<string, ReturnType<typeof mergeNotes>> = {};
    const mergedArchived: Record<string, ReturnType<typeof mergeArchivedNotes>> = {};

    for (const wid of ids) {
      mergedCategories[wid] = mergeCategories(localCategories[wid] || [], remoteCategories[wid] || []);
      mergedNotes[wid] = mergeNotes(localNotes[wid] || [], remoteNotes[wid] || []);
      mergedArchived[wid] = mergeArchivedNotes(localArchived[wid] || [], remoteArchived[wid] || []);
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

    // Push merged (last-write-wins; upsert)
    const pushResults = await Promise.all([
      // Push the merged workspace list (remote-priority + local-only kept)
      pushWorkspaces(mergedWorkspacesWithOwner),
      pushWorkspacePins(mergedPins.merged),
      ...ids.flatMap((wid) => {
        const cats = mergedCategories[wid].merged;
        const notesAligned = alignNoteCategoryIds(mergedNotes[wid].merged, cats);
        const archAligned = alignArchivedNoteCategoryIds(mergedArchived[wid].merged, cats);
        return [
          pushCategories(cats),
          pushNotes(notesAligned),
          pushArchivedNotes(archAligned),
        ];
      }),
    ]);

    const failed = pushResults.find((r) => (r as any).ok === false) as { ok: false; error: SyncError } | undefined;
    if (failed) return { ok: false, error: failed.error };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: mkError('Full sync failed', e) };
  }
}

