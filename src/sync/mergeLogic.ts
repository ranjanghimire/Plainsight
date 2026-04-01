import type {
  ArchivedNote,
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

export function mergeNotes(local: Note[], remote: Note[]): MergeResult<Note> {
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

