import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as localDB from '../src/sync/localDB';
import * as syncHelpers from '../src/sync/syncHelpers';
import { archivedRowIdForText } from '../src/sync/workspaceStorageBridge';
import { scheduleFullSyncAfterArchivedBulkDeletes } from '../src/sync/persistArchivedBulkDeleteTombstones';
import { mergeArchivedNotes } from '../src/sync/mergeLogic';

const WID = '00000000-0000-4000-8000-00000000a1c9';

describe('archive clear — tombstones before queueFullSync', () => {
  beforeEach(async () => {
    await localDB.clearLocalWorkspaceData(WID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('calls queueFullSync only after saveLocalArchivedNoteTombstones finishes', async () => {
    const order: string[] = [];
    const origSave = localDB.saveLocalArchivedNoteTombstones;
    vi.spyOn(localDB, 'saveLocalArchivedNoteTombstones').mockImplementation(async (w, rows) => {
      order.push('save-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('save-end');
      return origSave(w, rows);
    });
    vi.spyOn(syncHelpers, 'queueFullSync').mockImplementation(() => {
      order.push('queue');
    });

    await scheduleFullSyncAfterArchivedBulkDeletes(WID, ['alpha note body']);

    expect(order).toEqual(['save-start', 'save-end', 'queue']);
  });

  /**
   * Regression: tombstones were written in a fire-and-forget async while queueFullSync ran
   * on a 320ms debounce, so fullSync could merge remote archived rows back before tombstones
   * existed. User saw archive empty briefly, then items returned after ~debounce seconds.
   */
  it('after clear schedule resolves, tombstones still exist 5s later (no accidental wipe)', async () => {
    vi.useFakeTimers();
    const text = 'shared archive line';
    const id = archivedRowIdForText(WID, text);
    await localDB.saveLocalArchivedNotes(WID, [
      {
        id,
        workspace_id: WID,
        text,
        category_id: null,
        last_deleted_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
      },
    ]);

    vi.spyOn(syncHelpers, 'queueFullSync').mockImplementation(() => {});

    await scheduleFullSyncAfterArchivedBulkDeletes(WID, [text]);

    expect((await localDB.getLocalArchivedNoteTombstones(WID)).some((t) => t.id === id)).toBe(true);

    vi.advanceTimersByTime(5000);

    expect((await localDB.getLocalArchivedNoteTombstones(WID)).some((t) => t.id === id)).toBe(true);
  });

  it('with tombstones present, merge + tombstone filter drops remote copy of deleted id', async () => {
    const text = 'to be purged';
    const id = archivedRowIdForText(WID, text);
    await localDB.saveLocalArchivedNotes(WID, []);
    await scheduleFullSyncAfterArchivedBulkDeletes(WID, [text]);
    const tombs = await localDB.getLocalArchivedNoteTombstones(WID);
    expect(tombs.some((t) => t.id === id)).toBe(true);

    const remote = [
      {
        id,
        workspace_id: WID,
        text,
        category_id: null,
        last_deleted_at: '2022-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    const merged = mergeArchivedNotes([], remote);
    const tombIds = new Set(tombs.map((t) => t.id));
    const after = merged.merged.filter((n) => !tombIds.has(n.id));
    expect(after).toHaveLength(0);
  });
});
