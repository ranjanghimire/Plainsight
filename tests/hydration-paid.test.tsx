/**
 * Paid hydration: remote-only bootstrap, local+remote workspace merge, mergeRemoteAndLocalWorkspaces helpers,
 * and successful initial sync broadcasting `plainsight:full-sync`.
 */

import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPlainsightStorage, configurePaidUserTestMode } from './categoryTestHarness';
import { applyVitestPaidSyncFlags } from './hydration/entitlementLossTestUtils';
import {
  createHydrationTestWorkspaceId,
  renderHydrationHome,
  waitForHydrationCompleteAttr,
} from './hydration/hydrationHarness';
import {
  deleteAllNotesInWorkspace,
  deleteRemoteWorkspaceCascadeViaService,
  deleteRemoteWorkspacesForOwnerExcept,
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
  insertNoteRowViaService,
} from './supabaseTestHelpers';
import * as localDB from '../src/sync/localDB';
import * as syncEngine from '../src/sync/syncEngine';
import { setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import {
  getOrCreateWorkspaceIdForStorageKey,
  getStorageKeyForWorkspaceId,
  loadWorkspace,
  saveWorkspace,
  setWorkspaceIdMapping,
  VISIBLE_WS_PREFIX,
} from '../src/utils/storage';

const hasServiceRole = Boolean(process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim());
const paidDescribe = hasServiceRole ? describe : describe.skip;

const PAID_HOME_ROW_ID = createHydrationTestWorkspaceId();
const PAID_LOCAL_EXTRA_ROW_ID = createHydrationTestWorkspaceId();
/** Second visible tab (e.g. “Food Items”) for note isolation regression. */
const PAID_FOOD_VISIBLE_ROW_ID = createHydrationTestWorkspaceId();

paidDescribe('hydration — paid user (Supabase)', () => {
  const userId = process.env.VITEST_SUPABASE_USER_ID?.trim() || '';

  beforeEach(async () => {
    clearPlainsightStorage();
    setWorkspaceIdMapping('workspace_home', PAID_HOME_ROW_ID);
    await ensurePaidTestIdentity();
    configurePaidUserTestMode();
    applyVitestPaidSyncFlags(true);
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (hasServiceRole) {
      await deleteRemoteWorkspaceCascadeViaService(PAID_HOME_ROW_ID);
      await deleteRemoteWorkspaceCascadeViaService(PAID_LOCAL_EXTRA_ROW_ID);
      await deleteRemoteWorkspaceCascadeViaService(PAID_FOOD_VISIBLE_ROW_ID);
    }
  });

  it('remote-only: initial hydration pulls workspaces into local DB; UI shows Home', async () => {
    const homeId = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    expect(homeId).toBe(PAID_HOME_ROW_ID);
    await ensureRemoteWorkspaceRow({
      workspaceId: homeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });

    renderHydrationHome();
    await waitForHydrationCompleteAttr();

    const local = await localDB.getLocalWorkspaces();
    expect(local.some((w) => w.id === homeId)).toBe(true);

    const probe = screen.getByTestId('hydration-probe');
    expect(probe.getAttribute('data-visible-names')).toContain('Home');
    expect(probe.getAttribute('data-active-key')).toBe('workspace_home');
  });

  it('local + remote merge: union by id, no duplicates', async () => {
    const homeId = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    const localOnlyId = PAID_LOCAL_EXTRA_ROW_ID;
    const now = new Date().toISOString();

    await ensureRemoteWorkspaceRow({
      workspaceId: homeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });

    await localDB.saveLocalWorkspaces([
      {
        id: homeId,
        owner_id: userId,
        name: 'Home',
        kind: 'visible',
        created_at: now,
        updated_at: now,
      },
      {
        id: localOnlyId,
        owner_id: userId,
        name: 'LocalExtraTab',
        kind: 'visible',
        created_at: now,
        updated_at: now,
      },
    ]);

    const r = await syncEngine.fullSync();
    expect(r.ok).toBe(true);

    const merged = await localDB.getLocalWorkspaces();
    const ids = merged.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(homeId);
    expect(ids).toContain(localOnlyId);
    const homeRows = merged.filter((w) => w.id === homeId);
    expect(homeRows).toHaveLength(1);
    expect(homeRows[0].name).toBe('Home');
    const localOnlyRows = merged.filter((w) => w.id === localOnlyId);
    expect(localOnlyRows).toHaveLength(1);
    expect(localOnlyRows[0].name).toBe('LocalExtraTab');
  });

  it('initial paid hydration dispatches plainsight:full-sync when sync succeeds', async () => {
    const homeId = getOrCreateWorkspaceIdForStorageKey('workspace_home');
    await ensureRemoteWorkspaceRow({
      workspaceId: homeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });

    let fullSyncEvents = 0;
    const onFullSync = () => {
      fullSyncEvents += 1;
    };
    window.addEventListener('plainsight:full-sync', onFullSync);
    try {
      renderHydrationHome();
      await waitForHydrationCompleteAttr();
      await waitFor(() => expect(fullSyncEvents).toBeGreaterThanOrEqual(1), { timeout: 60_000 });
    } finally {
      window.removeEventListener('plainsight:full-sync', onFullSync);
    }
  });

  /**
   * Regression: Home UI blob empty, notes only on a second visible workspace (remote).
   * After initial fullSync + hydrate, Home must stay empty and Food’s note must not appear under workspace_home.
   */
  it('keeps second visible workspace notes off Home after paid hydration (empty home blob)', async () => {
    const homeId = PAID_HOME_ROW_ID;
    const foodId = PAID_FOOD_VISIBLE_ROW_ID;
    const foodVisKey = `${VISIBLE_WS_PREFIX}${foodId}`;
    const foodNoteText = 'Regression: note belongs only on Food Items tab';

    setWorkspaceIdMapping('workspace_home', homeId);
    setWorkspaceIdMapping(foodVisKey, foodId);

    // Stray workspaces for the same test user (e.g. another "Home" row) change bind order and
    // which UUID receives `workspace_home`; clear so this scenario matches a clean account.
    await deleteRemoteWorkspacesForOwnerExcept(userId, []);

    await ensureRemoteWorkspaceRow({
      workspaceId: homeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });
    await ensureRemoteWorkspaceRow({
      workspaceId: foodId,
      ownerId: userId,
      name: 'Food Items',
      kind: 'visible',
    });

    await deleteAllNotesInWorkspace(homeId);
    await deleteAllNotesInWorkspace(foodId);

    const now = new Date().toISOString();
    await insertNoteRowViaService({
      id: crypto.randomUUID(),
      workspace_id: foodId,
      text: foodNoteText,
      category_id: null,
      created_at: now,
      updated_at: now,
    });

    saveWorkspace('workspace_home', { categories: [], notes: [], archivedNotes: {} });
    saveWorkspace(foodVisKey, { categories: [], notes: [], archivedNotes: {} });

    renderHydrationHome();
    await waitForHydrationCompleteAttr();

    expect(getStorageKeyForWorkspaceId(homeId)).toBe('workspace_home');
    expect(getStorageKeyForWorkspaceId(foodId)).toBe(foodVisKey);

    const homeBlob = loadWorkspace('workspace_home');
    expect(homeBlob.notes?.length ?? 0).toBe(0);
    expect(homeBlob.notes?.some((n) => n.text === foodNoteText)).toBe(false);

    const foodBlob = loadWorkspace(foodVisKey);
    expect(foodBlob.notes?.some((n) => n.text === foodNoteText)).toBe(true);

    await waitFor(() => {
      expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('0');
    });
  });
});

const MERGE_SHARED_WS_ID = createHydrationTestWorkspaceId();
const MERGE_REMOTE_ONLY_ID = createHydrationTestWorkspaceId();
const MERGE_LOCAL_ONLY_ID = createHydrationTestWorkspaceId();

describe('mergeRemoteAndLocalWorkspaces (hydration shape)', () => {
  it('keeps remote row when both sides share an id', () => {
    const remote = [
      {
        id: MERGE_SHARED_WS_ID,
        owner_id: 'u',
        name: 'Remote',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ];
    const local = [
      {
        id: MERGE_SHARED_WS_ID,
        owner_id: 'u',
        name: 'Local',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2000-01-01T00:00:00.000Z',
      },
    ];
    const m = syncEngine.mergeRemoteAndLocalWorkspaces(remote, local);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe('Remote');
  });

  it('appends local-only ids', () => {
    const remote = [
      {
        id: MERGE_REMOTE_ONLY_ID,
        owner_id: 'u',
        name: 'A',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    const local = [
      {
        id: MERGE_LOCAL_ONLY_ID,
        owner_id: 'u',
        name: 'B',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    const m = syncEngine.mergeRemoteAndLocalWorkspaces(remote, local);
    expect(m.map((x) => x.id).sort()).toEqual([MERGE_REMOTE_ONLY_ID, MERGE_LOCAL_ONLY_ID].sort());
  });
});
