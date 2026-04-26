import type { ArchivedNote, Category, Note, NoteTombstone } from './types';
import {
  getLocalArchivedNoteTombstones,
  getLocalArchivedNotes,
  getLocalCategories,
  getLocalNotes,
  getLocalNoteTombstones,
  saveLocalArchivedNoteTags,
  saveLocalArchivedNotes,
  saveLocalCategories,
  saveLocalNoteTags,
  saveLocalNotes,
  saveLocalNoteTombstones,
} from './localDB';
import { archivedNoteTagRowsFromArchived, noteTagRowsFromNotes } from './tagSync';
import { flushWorkspaceUiIntoLocalDb, hydrateWorkspaceUiFromLocalDb } from './workspaceStorageBridge';
import { sortNotesNewestFirst } from '../utils/noteDisplayOrder';

type ChangePayload<T> = {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  newRow: T | null;
  oldRow: T | null;
};

const perWorkspaceQueue = new Map<string, Promise<void>>();

function enqueueWorkspace(workspaceId: string, fn: () => Promise<void>): Promise<void> {
  const prev = perWorkspaceQueue.get(workspaceId) || Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(fn)
    .finally(() => {
      if (perWorkspaceQueue.get(workspaceId) === next) perWorkspaceQueue.delete(workspaceId);
    });
  perWorkspaceQueue.set(workspaceId, next);
  return next;
}

function upsertById<T extends { id: string }>(rows: T[], next: T): T[] {
  const i = rows.findIndex((r) => r.id === next.id);
  if (i < 0) return [...rows, next];
  const copy = rows.slice();
  copy[i] = next;
  return copy;
}

function removeById<T extends { id: string }>(rows: T[], id: string): T[] {
  return rows.filter((r) => r.id !== id);
}

function ts(s: string | undefined | null): number {
  if (!s) return Number.NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Number.NaN;
}

export async function applyRealtimeNoteChange(
  workspaceId: string,
  payload: ChangePayload<Note>,
): Promise<void> {
  return enqueueWorkspace(workspaceId, async () => {
    // Preserve optimistic local edits: avoid clobbering the UI blob from a local DB snapshot
    // that hasn't yet absorbed the user's latest typing.
    await flushWorkspaceUiIntoLocalDb(workspaceId);
    const rows = await getLocalNotes(workspaceId);
    const tombs = await getLocalNoteTombstones(workspaceId);
    let nextRows = rows;
    if (payload.event === 'DELETE') {
      const id = payload.oldRow?.id;
      if (id) {
        nextRows = removeById(rows, id);
        const deletedAt = new Date().toISOString();
        const nextTombs: NoteTombstone[] = [
          { id, workspace_id: workspaceId, deleted_at: deletedAt },
          ...tombs.filter((t) => t.id !== id),
        ];
        await saveLocalNoteTombstones(workspaceId, nextTombs);
      }
    } else {
      const row = payload.newRow;
      if (row?.id) {
        // Prevent resurrection:
        // - ignore out-of-order updates (older updated_at)
        // - ignore upserts for ids that have a newer/equal tombstone deleted_at
        const existing = rows.find((n) => n.id === row.id) || null;
        const existingTs = existing ? ts(existing.updated_at) : Number.NaN;
        const incomingTs = ts(row.updated_at);
        if (
          Number.isFinite(existingTs) &&
          Number.isFinite(incomingTs) &&
          incomingTs < existingTs
        ) {
          // stale update; ignore
        } else {
          const tomb = tombs.find((t) => t.id === row.id) || null;
          const tombTs = tomb ? ts(tomb.deleted_at) : Number.NaN;
          if (
            tomb &&
            Number.isFinite(tombTs) &&
            Number.isFinite(incomingTs) &&
            tombTs >= incomingTs
          ) {
            // deleted after (or at) this update; ignore
          } else {
            nextRows = upsertById(rows, row);
          }
        }
      }
    }
    await saveLocalNotes(workspaceId, sortNotesNewestFirst(nextRows));
    await saveLocalNoteTags(workspaceId, noteTagRowsFromNotes(nextRows));
    await hydrateWorkspaceUiFromLocalDb(workspaceId);
  });
}

export async function applyRealtimeCategoryChange(
  workspaceId: string,
  payload: ChangePayload<Category>,
): Promise<void> {
  return enqueueWorkspace(workspaceId, async () => {
    await flushWorkspaceUiIntoLocalDb(workspaceId);
    const rows = await getLocalCategories(workspaceId);
    let nextRows = rows;
    if (payload.event === 'DELETE') {
      const id = payload.oldRow?.id;
      if (id) nextRows = removeById(rows, id);
    } else {
      const row = payload.newRow;
      if (row?.id) nextRows = upsertById(rows, row);
    }
    await saveLocalCategories(workspaceId, nextRows);
    await hydrateWorkspaceUiFromLocalDb(workspaceId);
  });
}

export async function applyRealtimeArchivedNoteChange(
  workspaceId: string,
  payload: ChangePayload<ArchivedNote>,
): Promise<void> {
  return enqueueWorkspace(workspaceId, async () => {
    // Do not flush UI → DB here: a peer's realtime event can interleave after "clear all" while
    // localStorage still holds a stale archived map; flush would resurrect rows into IndexedDB.
    const rows = await getLocalArchivedNotes(workspaceId);
    const archTombs = await getLocalArchivedNoteTombstones(workspaceId);
    let nextRows = rows;
    if (payload.event === 'DELETE') {
      const id = payload.oldRow?.id;
      if (id) nextRows = removeById(rows, id);
    } else {
      const row = payload.newRow;
      if (row?.id) {
        // Bulk clear / delete tombstones: ignore stale broadcast INSERT/UPDATE with older
        // last_deleted_at than the tomb (e.g. other client still replaying old rows).
        const tomb = archTombs.find((t) => t.id === row.id) || null;
        const tombTs = tomb ? ts(tomb.deleted_at) : Number.NaN;
        const incomingTs = ts(row.last_deleted_at);
        if (
          tomb &&
          Number.isFinite(tombTs) &&
          Number.isFinite(incomingTs) &&
          tombTs >= incomingTs
        ) {
          // tombstone wins — do not resurrect
        } else {
          nextRows = upsertById(rows, row);
        }
      }
    }
    await saveLocalArchivedNotes(workspaceId, nextRows);
    await saveLocalArchivedNoteTags(workspaceId, archivedNoteTagRowsFromArchived(nextRows));
    await hydrateWorkspaceUiFromLocalDb(workspaceId);
  });
}

