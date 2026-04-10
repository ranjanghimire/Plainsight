/**
 * Regression: locally deleted notes (tombstones) must not resurrect when remote still has rows;
 * sync must push deletes so Supabase matches local truth.
 */

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  seedFreshHomeWorkspace,
} from './categoryTestHarness';
import { createHydrationTestWorkspaceId, renderHydrationHome, waitForHydrationCompleteAttr } from './hydration/hydrationHarness';
import {
  countNotesInWorkspace,
  deleteAllNotesInWorkspace,
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
  insertNoteRowViaService,
} from './supabaseTestHelpers';
import * as localDB from '../src/sync/localDB';
import { fullSync } from '../src/sync/syncEngine';
import {
  getDefaultWorkspaceData,
  getOrCreateWorkspaceIdForStorageKey,
  getWorkspaceIdForStorageKey,
  loadWorkspace,
  saveWorkspace,
  setWorkspaceIdMapping,
} from '../src/utils/storage';

const hasServiceRole = Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim());
const paidDescribe = hasServiceRole ? describe : describe.skip;

const TOMBSTONE_HOME_ROW_ID = createHydrationTestWorkspaceId();

paidDescribe('hydration regression — note tombstones (no resurrection)', () => {
  const userId = process.env.VITEST_SUPABASE_USER_ID?.trim() || '';

  beforeEach(async () => {
    clearPlainsightStorage();
    setWorkspaceIdMapping('workspace_home', TOMBSTONE_HOME_ROW_ID);
    await ensurePaidTestIdentity();
    configurePaidUserTestMode();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (hasServiceRole) {
      await deleteRemoteWorkspaceCascadeViaService(TOMBSTONE_HOME_ROW_ID);
    }
  });

  it('remote has 3 notes; local offline deletes 2; hydration keeps 1 and sync removes stale remote rows', async () => {
    seedFreshHomeWorkspace();
    const homeId = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    await deleteAllNotesInWorkspace(homeId);
    await ensureRemoteWorkspaceRow({
      workspaceId: homeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });

    const bindRes = await fullSync();
    expect(bindRes.ok).toBe(true);
    const wid = getWorkspaceIdForStorageKey('workspace_home') ?? homeId;

    const t0 = new Date().toISOString();
    const idKeep = crypto.randomUUID();
    const idDelA = crypto.randomUUID();
    const idDelB = crypto.randomUUID();

    await insertNoteRowViaService({
      id: idKeep,
      workspace_id: wid,
      text: 'keep',
      created_at: t0,
      updated_at: t0,
    });
    await insertNoteRowViaService({
      id: idDelA,
      workspace_id: wid,
      text: 'gone-a',
      created_at: t0,
      updated_at: t0,
    });
    await insertNoteRowViaService({
      id: idDelB,
      workspace_id: wid,
      text: 'gone-b',
      created_at: t0,
      updated_at: t0,
    });

    const pushRes = await fullSync();
    expect(pushRes.ok).toBe(true);
    expect(await countNotesInWorkspace(wid)).toBe(3);

    const deletedAt = new Date().toISOString();
    await localDB.saveLocalWorkspaces([
      {
        id: wid,
        owner_id: userId,
        name: 'Home',
        kind: 'visible',
        created_at: t0,
        updated_at: t0,
      },
    ]);

    saveWorkspace('workspace_home', {
      ...getDefaultWorkspaceData(),
      notes: [{ id: idKeep, text: 'keep', createdAt: t0 }],
    });

    await localDB.saveLocalNotes(wid, [
      {
        id: idKeep,
        workspace_id: wid,
        text: 'keep',
        category_id: null,
        created_at: t0,
        updated_at: t0,
      },
    ]);
    await localDB.saveLocalNoteTombstones(wid, [
      { id: idDelA, workspace_id: wid, deleted_at: deletedAt },
      { id: idDelB, workspace_id: wid, deleted_at: deletedAt },
    ]);

    expect(await countNotesInWorkspace(wid)).toBe(3);

    renderHydrationHome();
    await waitForHydrationCompleteAttr();

    const followUp = await fullSync();
    expect(followUp.ok).toBe(true);

    await waitFor(
      () => {
        expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('1');
      },
      { timeout: 90_000 },
    );

    const blob = loadWorkspace('workspace_home');
    expect((blob.notes || []).length).toBe(1);
    expect((blob.notes || [])[0]?.id).toBe(idKeep);

    expect(await localDB.getLocalNotes(wid)).toHaveLength(1);

    await waitFor(
      async () => {
        expect(await localDB.getLocalNoteTombstones(wid)).toHaveLength(0);
      },
      { timeout: 90_000 },
    );

    expect(await countNotesInWorkspace(wid)).toBe(1);
  });
});
