import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { archivedRowIdForText, flushWorkspaceUiIntoLocalDb } from '../src/sync/workspaceStorageBridge';
import { clearLocalWorkspaceData, getLocalArchivedNotes } from '../src/sync/localDB';
import { clearPlainsightStorage } from './categoryTestHarness';
import { setWorkspaceIdMapping, saveWorkspace, VISIBLE_WS_PREFIX } from '../src/utils/storage';

/**
 * Regression: flush used "authoritative empty" + required aPull.size > 0 to strip confirmed
 * rows, so an empty server pull wiped ALL UI archived (including a note just deleted into
 * archive before first push). Also, confirmed-only rows were not stripped when pull was empty.
 */

const WID = 'cccccccc-cccc-4ccc-dddd-eeeeeeeeeeee';
const SK = `${VISIBLE_WS_PREFIX}${WID}`;

describe('flush archived — delete-to-archive in shared workspace (empty remote pull)', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    setWorkspaceIdMapping(SK, WID);
    await clearLocalWorkspaceData(WID);
  });

  afterEach(() => {
    clearPlainsightStorage();
    vi.useRealTimers();
  });

  it('keeps a newly archived note when remote pull is empty and id is not yet server-confirmed', async () => {
    const body = 'Note moved to archive locally';
    const id = archivedRowIdForText(WID, body);
    const oldServerText = 'Previously synced archived row';
    const oldId = archivedRowIdForText(WID, oldServerText);

    const aConfirmed = new Set([oldId]);
    const aPull = new Set<string>();

    saveWorkspace(SK, {
      categories: [],
      notes: [],
      archivedNotes: {
        [body]: { text: body, lastDeletedAt: Date.now() },
      },
    });

    await flushWorkspaceUiIntoLocalDb(WID, {
      remoteArchivedIdsEverConfirmed: aConfirmed,
      remoteArchivedIdsThisPull: aPull,
    });

    const rows = await getLocalArchivedNotes(WID);
    expect(rows.some((r) => r.id === id)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('after flush, entry still present 5s later (no accidental wipe)', async () => {
    vi.useFakeTimers();
    const body = 'Still there after wait';
    const id = archivedRowIdForText(WID, body);
    const aConfirmed = new Set([archivedRowIdForText(WID, 'other')]);
    const aPull = new Set<string>();

    saveWorkspace(SK, {
      categories: [],
      notes: [],
      archivedNotes: {
        [body]: { text: body, lastDeletedAt: Date.now() },
      },
    });

    await flushWorkspaceUiIntoLocalDb(WID, {
      remoteArchivedIdsEverConfirmed: aConfirmed,
      remoteArchivedIdsThisPull: aPull,
    });

    vi.advanceTimersByTime(5000);

    const rows = await getLocalArchivedNotes(WID);
    expect(rows.some((r) => r.id === id)).toBe(true);
  });

  it('drops stale UI archived only when id was server-confirmed and missing from pull', async () => {
    const stale = 'gone from server';
    const staleId = archivedRowIdForText(WID, stale);
    const aConfirmed = new Set([staleId]);
    const aPull = new Set<string>();

    saveWorkspace(SK, {
      categories: [],
      notes: [],
      archivedNotes: {
        [stale]: { text: stale, lastDeletedAt: Date.now() },
      },
    });

    await flushWorkspaceUiIntoLocalDb(WID, {
      remoteArchivedIdsEverConfirmed: aConfirmed,
      remoteArchivedIdsThisPull: aPull,
    });

    expect(await getLocalArchivedNotes(WID)).toHaveLength(0);
  });
});
