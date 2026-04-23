/**
 * Paid hydration: remote-only bootstrap, local+remote workspace merge, mergeRemoteAndLocalWorkspaces helpers,
 * and successful initial sync broadcasting `plainsight:full-sync`.
 */

import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  seedFreshHomeWorkspace,
} from './categoryTestHarness';
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
// These tests exercise a real Supabase project and are sensitive to DB state/config drift.
// Opt-in with VITEST_STRICT_PAID=1 to run in CI against the production-like project.
const strictPaid = process.env.VITEST_STRICT_PAID === '1';
const paidDescribe = hasServiceRole && strictPaid ? describe : describe.skip;

const PAID_HOME_ROW_ID = createHydrationTestWorkspaceId();
const PAID_LOCAL_EXTRA_ROW_ID = createHydrationTestWorkspaceId();
/** Second visible tab (e.g. “Food Items”) for note isolation regression. */
const PAID_FOOD_VISIBLE_ROW_ID = createHydrationTestWorkspaceId();
/**
 * Simulates a fresh install UUID for `workspace_home` that does not match the server’s Home row
 * yet (existing user, new device) — must not produce a visible `Home (2)` tab after sync.
 */
const STALE_CLEAN_DEVICE_HOME_ID = createHydrationTestWorkspaceId();

/** Matches disambiguated junk labels: `Home (2)`, `Home(2)`, `Home (2) (2)`, etc. */
function visibleListHasNumberedHomeAlias(namesJoined: string): boolean {
  return /\bHome\s*\(\d+/.test(namesJoined);
}

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
      await deleteRemoteWorkspaceCascadeViaService(STALE_CLEAN_DEVICE_HOME_ID);
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

  /**
   * Regression: existing paid user opens app on a clean device — local `workspace_home` maps to a
   * fresh UUID while Supabase still has the account’s real Home row. Merge + name disambiguation
   * used to surface `Home (2)` briefly (or until a later fullSync). UI must never show numbered
   * Home aliases; local workspace rows must not keep those names after sync.
   */
  it('clean device + existing remote Home: no Home (2) / Home (2)(2) visible during or after sync wait', async () => {
    clearPlainsightStorage();
    seedFreshHomeWorkspace();
    await ensurePaidTestIdentity();
    configurePaidUserTestMode();
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });

    const remoteHomeId = PAID_HOME_ROW_ID;
    setWorkspaceIdMapping('workspace_home', STALE_CLEAN_DEVICE_HOME_ID);
    const now = new Date().toISOString();
    await localDB.saveLocalWorkspaces([
      {
        id: STALE_CLEAN_DEVICE_HOME_ID,
        owner_id: userId,
        name: 'Home',
        kind: 'visible',
        created_at: now,
        updated_at: now,
      },
    ]);

    await ensureRemoteWorkspaceRow({
      workspaceId: remoteHomeId,
      ownerId: userId,
      name: 'Home',
      kind: 'visible',
    });

    renderHydrationHome();

    await waitFor(
      () => {
        const el = screen.getByTestId('hydration-probe');
        const names = el.getAttribute('data-visible-names') ?? '';
        expect(visibleListHasNumberedHomeAlias(names)).toBe(false);
        expect(el.getAttribute('data-hydration-complete')).toBe('true');
      },
      { timeout: 90_000, interval: 120 },
    );

    const settleMs = 5_000;
    const stepMs = 250;
    for (let waited = 0; waited < settleMs; waited += stepMs) {
      const names = screen.getByTestId('hydration-probe').getAttribute('data-visible-names') ?? '';
      expect(visibleListHasNumberedHomeAlias(names)).toBe(false);
      await new Promise((r) => setTimeout(r, stepMs));
    }

    const rows = await localDB.getLocalWorkspaces();
    for (const w of rows) {
      const n = (w.name || '').trim();
      expect(n).not.toMatch(/^Home\s*\(\d+/i);
      expect(n).not.toMatch(/^Home\s*\(\d+\)\s*\(\d+/i);
    }
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
  it('keeps remote row when remote updated_at is newer', () => {
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

  it('keeps local row when local updated_at is newer', () => {
    const remote = [
      {
        id: MERGE_SHARED_WS_ID,
        owner_id: 'u',
        name: 'Remote',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    const local = [
      {
        id: MERGE_SHARED_WS_ID,
        owner_id: 'u',
        name: 'Local wins',
        kind: 'visible' as const,
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2030-01-01T00:00:00.000Z',
      },
    ];
    const m = syncEngine.mergeRemoteAndLocalWorkspaces(remote, local);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe('Local wins');
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
