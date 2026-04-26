import type {
  ArchivedNote,
  ArchivedNoteTombstone,
  Category,
  Note,
  Workspace,
  WorkspacePin,
} from './types';

type MergeResult<T> = {
  merged: T[];
  toPush: T[];
  toPull: T[];
};

function ts(s: string | null | undefined): number {
  const n = s ? Date.parse(s) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function winsByUpdatedAt<T extends { updated_at: string }>(a: T, b: T): T {
  return ts(a.updated_at) >= ts(b.updated_at) ? a : b;
}

export function mergeWorkspaces(local: Workspace[], remote: Workspace[]): MergeResult<Workspace> {
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const allIds = new Set([...l.keys(), ...r.keys()]);
  const merged: Workspace[] = [];
  const toPush: Workspace[] = [];
  const toPull: Workspace[] = [];

  for (const id of allIds) {
    const lv = l.get(id);
    const rv = r.get(id);
    if (lv && rv) {
      const winner = winsByUpdatedAt(lv, rv);
      merged.push(winner);
      if (winner === lv && ts(lv.updated_at) > ts(rv.updated_at)) toPush.push(lv);
      if (winner === rv && ts(rv.updated_at) > ts(lv.updated_at)) toPull.push(rv);
    } else if (lv) {
      merged.push(lv);
      toPush.push(lv);
    } else if (rv) {
      merged.push(rv);
      toPull.push(rv);
    }
  }

  merged.sort((a, b) => ts(b.updated_at) - ts(a.updated_at));
  return { merged, toPush, toPull };
}

export function mergeCategories(local: Category[], remote: Category[]): MergeResult<Category> {
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const allIds = new Set([...l.keys(), ...r.keys()]);
  const merged: Category[] = [];
  const toPush: Category[] = [];
  const toPull: Category[] = [];

  for (const id of allIds) {
    const lv = l.get(id);
    const rv = r.get(id);
    if (lv && rv) {
      const winner = winsByUpdatedAt(lv, rv);
      merged.push(winner);
      if (winner === lv && ts(lv.updated_at) > ts(rv.updated_at)) toPush.push(lv);
      if (winner === rv && ts(rv.updated_at) > ts(lv.updated_at)) toPull.push(rv);
    } else if (lv) {
      merged.push(lv);
      toPush.push(lv);
    } else if (rv) {
      merged.push(rv);
      toPull.push(rv);
    }
  }

  merged.sort((a, b) => ts(b.updated_at) - ts(a.updated_at));
  return { merged, toPush, toPull };
}

export type MergeNotesOptions = {
  /**
   * Note ids we have previously confirmed on the server (after a successful sync).
   * If a note appears locally but not in the current remote snapshot, and its id is in this set,
   * we treat it as deleted on the server (e.g. another collaborator deleted it) and omit it
   * instead of re-upserting from a stale UI blob.
   */
  remoteIdsEverConfirmed?: Set<string> | null;
};

export function mergeNotes(
  local: Note[],
  remote: Note[],
  options?: MergeNotesOptions | null,
): MergeResult<Note> {
  const confirmed = options?.remoteIdsEverConfirmed;
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const allIds = new Set([...l.keys(), ...r.keys()]);
  const merged: Note[] = [];
  const toPush: Note[] = [];
  const toPull: Note[] = [];

  for (const id of allIds) {
    const lv = l.get(id);
    const rv = r.get(id);
    if (lv && rv) {
      const winner = winsByUpdatedAt(lv, rv);
      merged.push(winner);
      if (winner === lv && ts(lv.updated_at) > ts(rv.updated_at)) toPush.push(lv);
      if (winner === rv && ts(rv.updated_at) > ts(lv.updated_at)) toPull.push(rv);
    } else if (lv) {
      if (confirmed?.has(id)) {
        // Was on server before; pull no longer lists it — remote delete, do not resurrect.
        continue;
      }
      merged.push(lv);
      toPush.push(lv);
    } else if (rv) {
      merged.push(rv);
      toPull.push(rv);
    }
  }

  merged.sort((a, b) => ts(b.updated_at) - ts(a.updated_at));
  return { merged, toPush, toPull };
}

/**
 * archived_notes has no updated_at in the schema, so we treat last_deleted_at
 * as the last-write field for conflict resolution.
 *
 * Note: archived row ids are deterministic from workspace + note text. The same text
 * archived again reuses the same id, so we must not drop local-only rows just because an
 * id appears in a "last seen on server" cache while the remote pull is empty — that is
 * often a fresh delete-to-archive before the new row is pushed. Stale UI rows are stripped
 * in flushWorkspaceUiIntoLocalDb (remoteArchivedIdsEverConfirmed + remoteArchivedIdsThisPull)
 * and tombstones handle explicit permanent deletes.
 */
export function mergeArchivedNotes(local: ArchivedNote[], remote: ArchivedNote[]): MergeResult<ArchivedNote> {
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const allIds = new Set([...l.keys(), ...r.keys()]);
  const merged: ArchivedNote[] = [];
  const toPush: ArchivedNote[] = [];
  const toPull: ArchivedNote[] = [];

  for (const id of allIds) {
    const lv = l.get(id);
    const rv = r.get(id);
    if (lv && rv) {
      const lt = ts(lv.last_deleted_at);
      const rt = ts(rv.last_deleted_at);
      const winner = lt >= rt ? lv : rv;
      merged.push(winner);
      if (winner === lv && lt > rt) toPush.push(lv);
      if (winner === rv && rt > lt) toPull.push(rv);
    } else if (lv) {
      merged.push(lv);
      toPush.push(lv);
    } else if (rv) {
      merged.push(rv);
      toPull.push(rv);
    }
  }

  merged.sort((a, b) => ts(b.last_deleted_at) - ts(a.last_deleted_at));
  return { merged, toPush, toPull };
}

function archTombTs(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * After mergeLocal+remote, drop rows a local permanent-delete tomb supersedes (same rules as
 * `applyRealtimeArchivedNoteChange`). If a row has newer `last_deleted_at` than the tomb
 * (re-archived after delete), keep the row and remove that tomb so we can push the live row.
 */
export function applyArchivedTombstoneFilter(
  merged: ArchivedNote[],
  tombs: ArchivedNoteTombstone[],
): { merged: ArchivedNote[]; nextTombs: ArchivedNoteTombstone[]; changed: boolean } {
  if (!tombs.length) return { merged, nextTombs: tombs, changed: false };
  const byId = new Map(tombs.map((t) => [t.id, t]));
  const toDropTomb = new Set<string>();
  const nextMerged = merged.filter((n) => {
    const tomb = byId.get(n.id);
    if (!tomb) return true;
    const tombTs = archTombTs(tomb.deleted_at);
    const rowTs = archTombTs(n.last_deleted_at);
    if (tomb && Number.isFinite(tombTs) && Number.isFinite(rowTs) && rowTs > tombTs) {
      toDropTomb.add(n.id);
      return true;
    }
    if (tomb && Number.isFinite(tombTs) && Number.isFinite(rowTs) && tombTs >= rowTs) {
      return false;
    }
    return true;
  });
  const nextTombs = toDropTomb.size
    ? tombs.filter((t) => !toDropTomb.has(t.id))
    : tombs;
  const changed = nextMerged.length !== merged.length || nextTombs !== tombs;
  return { merged: nextMerged, nextTombs, changed };
}

/**
 * workspace_pins has no updated_at in the schema; treat higher created_at as newer.
 * PK is (user_id, workspace_id).
 */
export function mergeWorkspacePins(local: WorkspacePin[], remote: WorkspacePin[]): MergeResult<WorkspacePin> {
  const key = (p: WorkspacePin) => `${p.user_id}:${p.workspace_id}`;
  const l = new Map(local.map((x) => [key(x), x]));
  const r = new Map(remote.map((x) => [key(x), x]));
  const allKeys = new Set([...l.keys(), ...r.keys()]);
  const merged: WorkspacePin[] = [];
  const toPush: WorkspacePin[] = [];
  const toPull: WorkspacePin[] = [];

  for (const k of allKeys) {
    const lv = l.get(k);
    const rv = r.get(k);
    if (lv && rv) {
      const lt = ts(lv.created_at);
      const rt = ts(rv.created_at);
      const winner = lt >= rt ? lv : rv;
      merged.push(winner);
      if (winner === lv && lt > rt) toPush.push(lv);
      if (winner === rv && rt > lt) toPull.push(rv);
    } else if (lv) {
      merged.push(lv);
      toPush.push(lv);
    } else if (rv) {
      merged.push(rv);
      toPull.push(rv);
    }
  }

  merged.sort((a, b) => a.position - b.position);
  return { merged, toPush, toPull };
}

