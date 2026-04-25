import { archivedRowIdForText } from './workspaceStorageBridge';
import { getLocalArchivedNoteTombstones, saveLocalArchivedNoteTombstones } from './localDB';
import { queueFullSync } from './syncHelpers';

/**
 * Persist tombstones for permanently removed archived rows, then schedule a full sync.
 * Must await tombstone persistence before queueFullSync so fullSync never merges/pushes
 * without seeing those tombstones (otherwise remote rows resurrect after ~debounce ms).
 */
export async function scheduleFullSyncAfterArchivedBulkDeletes(
  workspaceId: string,
  textKeys: string[],
): Promise<void> {
  if (!workspaceId || !textKeys?.length) {
    queueFullSync();
    return;
  }
  const deletedAt = new Date().toISOString();
  const ids = textKeys.map((t) => archivedRowIdForText(workspaceId, t));
  const existing = await getLocalArchivedNoteTombstones(workspaceId);
  const next = [
    ...ids.map((id) => ({ id, workspace_id: workspaceId, deleted_at: deletedAt })),
    ...existing.filter((t) => !ids.includes(t.id)),
  ];
  await saveLocalArchivedNoteTombstones(workspaceId, next);
  queueFullSync();
}
