import type { ArchivedNote, Category, Note } from './types';
import {
  getLocalArchivedNotes,
  getLocalCategories,
  getLocalNotes,
  saveLocalArchivedNoteTags,
  saveLocalArchivedNotes,
  saveLocalCategories,
  saveLocalNoteTags,
  saveLocalNotes,
} from './localDB';
import { archivedNoteTagRowsFromArchived, noteTagRowsFromNotes } from './tagSync';
import { flushWorkspaceUiIntoLocalDb, hydrateWorkspaceUiFromLocalDb } from './workspaceStorageBridge';

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

export async function applyRealtimeNoteChange(
  workspaceId: string,
  payload: ChangePayload<Note>,
): Promise<void> {
  return enqueueWorkspace(workspaceId, async () => {
    // Preserve optimistic local edits: avoid clobbering the UI blob from a local DB snapshot
    // that hasn't yet absorbed the user's latest typing.
    await flushWorkspaceUiIntoLocalDb(workspaceId);
    const rows = await getLocalNotes(workspaceId);
    let nextRows = rows;
    if (payload.event === 'DELETE') {
      const id = payload.oldRow?.id;
      if (id) nextRows = removeById(rows, id);
    } else {
      const row = payload.newRow;
      if (row?.id) nextRows = upsertById(rows, row);
    }
    await saveLocalNotes(workspaceId, nextRows);
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
    await flushWorkspaceUiIntoLocalDb(workspaceId);
    const rows = await getLocalArchivedNotes(workspaceId);
    let nextRows = rows;
    if (payload.event === 'DELETE') {
      const id = payload.oldRow?.id;
      if (id) nextRows = removeById(rows, id);
    } else {
      const row = payload.newRow;
      if (row?.id) nextRows = upsertById(rows, row);
    }
    await saveLocalArchivedNotes(workspaceId, nextRows);
    await saveLocalArchivedNoteTags(workspaceId, archivedNoteTagRowsFromArchived(nextRows));
    await hydrateWorkspaceUiFromLocalDb(workspaceId);
  });
}

