import { getLocalArchivedNoteTombstones, getLocalNoteTombstones, saveLocalArchivedNoteTombstones, saveLocalNoteTombstones } from './localDB';
import { queueFullSync } from './syncHelpers';

/**
 * Serialize note tombstone writes per workspace. Rapid delete-to-archive calls otherwise
 * race: each does read → merge → save, and concurrent reads see the same tombstone list so
 * the last save wins and drops earlier deletes — notes then resurrect after fullSync.
 */
const noteDeleteChains = new Map<string, Promise<unknown>>();

export type EnqueueNoteDeleteTombstoneOpts = {
  /**
   * Deterministic id for the archived row we're about to (re)create. When the user had
   * permanently removed this text and later deletes the active note into the archive again,
   * we must clear the old archived tombstone or fullSync would drop the new row and/or
   * push a remote delete for a live re-archived row.
   */
  clearArchivedRowIdForRearchive?: string;
};

export function enqueueNoteDeleteTombstone(
  workspaceId: string,
  noteId: string,
  opts?: EnqueueNoteDeleteTombstoneOpts,
): void {
  const wid = String(workspaceId || '').trim();
  const nid = String(noteId || '').trim();
  if (!wid || !nid) return;

  const reArchId = String(opts?.clearArchivedRowIdForRearchive || '').trim();

  const prev = noteDeleteChains.get(wid) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      if (reArchId) {
        const archExisting = await getLocalArchivedNoteTombstones(wid);
        if (archExisting.some((t) => t.id === reArchId)) {
          await saveLocalArchivedNoteTombstones(
            wid,
            archExisting.filter((t) => t.id !== reArchId),
          );
        }
      }
      const deletedAt = new Date().toISOString();
      const existing = await getLocalNoteTombstones(wid);
      await saveLocalNoteTombstones(wid, [
        { id: nid, workspace_id: wid, deleted_at: deletedAt },
        ...existing.filter((t) => t.id !== nid),
      ]);
    });
  noteDeleteChains.set(wid, next);
  void next.finally(() => {
    queueFullSync();
  });
}

/** Vitest: await all queued deletes for a workspace. */
export async function flushNoteDeleteTombstoneQueueForTests(workspaceId: string): Promise<void> {
  const p = noteDeleteChains.get(String(workspaceId || '').trim());
  if (p) await p.catch(() => undefined);
}

/** Vitest: clear in-memory chain state between tests. */
export function resetNoteDeleteTombstoneQueueForTests(): void {
  noteDeleteChains.clear();
}
