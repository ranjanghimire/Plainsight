import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveLocalNoteTombstones, saveLocalNotes, getLocalNotes } from '../src/sync/localDB';
import {
  mergedNotesForUpsertAfterDeletes,
} from '../src/sync/syncEngine';
import type { Note } from '../src/sync/types';
import { flushWorkspaceUiIntoLocalDb } from '../src/sync/workspaceStorageBridge';
import { clearPlainsightStorage } from './categoryTestHarness';
import { setWorkspaceIdMapping, saveWorkspace, VISIBLE_WS_PREFIX } from '../src/utils/storage';

const WID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
const SK = `${VISIBLE_WS_PREFIX}${WID}`;

function note(id: string, text: string): Note {
  const t = new Date().toISOString();
  return {
    id,
    workspace_id: WID,
    text,
    category_id: null,
    created_at: t,
    updated_at: t,
  };
}

describe('shared workspace deletes must not resurrect on sync', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    setWorkspaceIdMapping(SK, WID);
  });

  afterEach(() => {
    clearPlainsightStorage();
  });

  it('mergedNotesForUpsertAfterDeletes: ~10 notes, exclude ~4 server-deleted ids → 6 for pushNotes', () => {
    const keep = Array.from({ length: 6 }, (_, i) =>
      note(`00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`, `keep ${i}`),
    );
    const gone = Array.from({ length: 4 }, (_, i) =>
      note(`10000000-0000-4000-8000-${String(2000 + i).padStart(12, '0')}`, `gone ${i}`),
    );
    const merged = [...keep, ...gone];
    const removedFromServer = new Set(gone.map((n) => n.id));
    const tombRemaining = new Set<string>();
    const forUpsert = mergedNotesForUpsertAfterDeletes(merged, tombRemaining, removedFromServer);
    expect(forUpsert).toHaveLength(6);
    for (const g of gone) {
      expect(forUpsert.some((n) => n.id === g.id)).toBe(false);
    }
  });

  it('mergedNotesForUpsertAfterDeletes: also drops remaining tombstones', () => {
    const a = note('20000000-0000-4000-8000-000000000001', 'a');
    const b = note('20000000-0000-4000-8000-000000000002', 'b');
    const merged = [a, b];
    const out = mergedNotesForUpsertAfterDeletes(merged, new Set([b.id]), new Set());
    expect(out.map((n) => n.id)).toEqual([a.id]);
  });

  it('flushWorkspaceUiIntoLocalDb strips tombstoned ids from UI even if workspace JSON is stale', async () => {
    const nLive = '30000000-0000-4000-8000-000000000001';
    const nDead = '30000000-0000-4000-8000-000000000002';
    const now = new Date().toISOString();
    saveWorkspace(SK, {
      categories: [],
      notes: [
        { id: nLive, text: 'live', createdAt: now, updatedAt: now },
        { id: nDead, text: 'should not flush', createdAt: now, updatedAt: now },
      ],
      archivedNotes: {},
    });
    await saveLocalNotes(WID, [note(nLive, 'live'), note(nDead, 'from-db')]);
    await saveLocalNoteTombstones(WID, [
      { id: nDead, workspace_id: WID, deleted_at: new Date().toISOString() },
    ]);
    await flushWorkspaceUiIntoLocalDb(WID);
    const rows = await getLocalNotes(WID);
    expect(rows.some((r) => r.id === nDead)).toBe(false);
    expect(rows.some((r) => r.id === nLive)).toBe(true);
  });
});
