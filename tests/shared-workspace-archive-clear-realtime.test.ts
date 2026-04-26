/**
 * Regression: shared workspace "Clear all" in archive with both collaborators online.
 * A leading flushWorkspaceUiIntoLocalDb before applying archived realtime could merge a stale
 * localStorage archived map back into IndexedDB, so cleared rows reappeared within seconds.
 *
 * Scenario (user2 clears while user1 app open): user1 has empty archived rows + tombstones in
 * the local DB but UI blob can still list archived text; realtime INSERT replay must not refill
 * the DB from that stale UI before tombstone logic runs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getLocalArchivedNotes,
  saveLocalArchivedNotes,
  saveLocalArchivedNoteTombstones,
} from '../src/sync/localDB';
import { applyRealtimeArchivedNoteChange } from '../src/sync/realtimeApply';
import { archivedRowIdForText } from '../src/utils/archivedIds';
import { saveWorkspace, setWorkspaceIdMapping, VISIBLE_WS_PREFIX } from '../src/utils/storage';
import { clearPlainsightStorage } from './categoryTestHarness';

const WID = 'bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee';
const SK = `${VISIBLE_WS_PREFIX}${WID}`;
const ARCHIVE_TEXT = 'note from collaborative session';

describe('shared workspace archive clear + realtime (both peers)', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    await saveLocalArchivedNotes(WID, []);
    await saveLocalArchivedNoteTombstones(WID, []);
    setWorkspaceIdMapping(SK, WID);
    saveWorkspace(SK, {
      notes: [],
      categories: [],
      archivedNotes: {
        [ARCHIVE_TEXT]: {
          text: ARCHIVE_TEXT,
          lastDeletedAt: Date.parse('2020-01-01T00:00:00.000Z'),
        },
      },
    });
  });

  afterEach(async () => {
    clearPlainsightStorage();
    await saveLocalArchivedNotes(WID, []);
    await saveLocalArchivedNoteTombstones(WID, []);
  });

  it('stale UI archived map + tombstone + INSERT replay: local archived rows stay empty', async () => {
    await saveLocalArchivedNotes(WID, []);
    const id = archivedRowIdForText(WID, ARCHIVE_TEXT);
    await saveLocalArchivedNoteTombstones(WID, [
      {
        id,
        workspace_id: WID,
        deleted_at: '2025-06-01T12:00:00.000Z',
      },
    ]);

    await applyRealtimeArchivedNoteChange(WID, {
      event: 'INSERT',
      newRow: {
        id,
        workspace_id: WID,
        text: ARCHIVE_TEXT,
        category_id: null,
        last_deleted_at: '2024-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
      },
      oldRow: null,
    });

    const after = await getLocalArchivedNotes(WID);
    expect(after).toHaveLength(0);
  });
});
