import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueNoteDeleteTombstone,
  flushNoteDeleteTombstoneQueueForTests,
  resetNoteDeleteTombstoneQueueForTests,
} from '../src/sync/noteDeleteTombstoneQueue';
import { clearLocalWorkspaceData, getLocalNoteTombstones } from '../src/sync/localDB';
import * as syncHelpers from '../src/sync/syncHelpers';

const WID = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

describe('rapid delete-to-archive — note tombstones must not race', () => {
  beforeEach(async () => {
    resetNoteDeleteTombstoneQueueForTests();
    await clearLocalWorkspaceData(WID);
    vi.spyOn(syncHelpers, 'queueFullSync').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetNoteDeleteTombstoneQueueForTests();
    vi.useRealTimers();
  });

  it('parallel tombstone writes retain every deleted note id', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(100000 + i).padStart(12, '0')}`);
    await Promise.all(ids.map((id) => Promise.resolve().then(() => enqueueNoteDeleteTombstone(WID, id))));
    await flushNoteDeleteTombstoneQueueForTests(WID);
    const tombs = await getLocalNoteTombstones(WID);
    const tombIds = new Set(tombs.map((t) => t.id));
    for (const id of ids) {
      expect(tombIds.has(id)).toBe(true);
    }
    expect(tombs.length).toBe(10);
  });

  it('sequential deletes every 2s then 10s wait — all tombstones still present', async () => {
    vi.useFakeTimers();
    const ids = Array.from({ length: 10 }, (_, i) => `11111111-1111-4111-8111-${String(200000 + i).padStart(12, '0')}`);
    for (let i = 0; i < 10; i += 1) {
      enqueueNoteDeleteTombstone(WID, ids[i]);
      vi.advanceTimersByTime(2000);
    }
    vi.advanceTimersByTime(10_000);
    await flushNoteDeleteTombstoneQueueForTests(WID);
    const tombs = await getLocalNoteTombstones(WID);
    const tombIds = new Set(tombs.map((t) => t.id));
    for (const id of ids) {
      expect(tombIds.has(id)).toBe(true);
    }
    expect(tombs.length).toBe(10);
  });
});
