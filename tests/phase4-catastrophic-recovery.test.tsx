/**
 * Phase 4: catastrophic recovery — corrupted local state, partial hydration, Supabase errors,
 * session invalidation, workspace inconsistencies. Paid block requires Vitest Supabase env.
 */

import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configurePaidUserTestMode,
  preparePaidRemoteWorkspaceRowsForKeys,
  seedFreshHomeWorkspace,
} from './categoryTestHarness';
import {
  applyVitestPaidSyncFlags,
} from './hydration/entitlementLossTestUtils';
import { createHydrationTestWorkspaceId, renderHydrationHome, waitForHydrationCompleteAttr } from './hydration/hydrationHarness';
import { seedHomePlusVisibleWorkspaceWithRowId } from './hydration/hydrationWorkspaceSeed';
import {
  injectCorruptedAppStateRaw,
  injectCorruptedWorkspaceBlob,
  injectPartiallyInvalidVisibleWorkspaceList,
  injectUnreadableLocalDbJson,
  invalidateVitestSession,
  readAppStateVisibleCount,
  restoreVitestPaidSession,
  simulatedSyncError,
} from './phase4/catastrophicRecoveryHarness';
import * as syncEngine from '../src/sync/syncEngine';
import { getCanUseSupabase, setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import { notifyHydrationComplete } from '../src/sync/hydrationBridge';
import * as syncHelpers from '../src/sync/syncHelpers';
import {
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
} from './supabaseTestHelpers';
import * as localDB from '../src/sync/localDB';
import { loadAppState, loadWorkspace, saveWorkspace, setWorkspaceIdMapping } from '../src/utils/storage';

const hasPaidEnv = Boolean(
  process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.VITEST_SUPABASE_USER_ID?.trim() &&
    process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim(),
);

const paidDescribe = hasPaidEnv ? describe : describe.skip;

const HOME_ROW_ID = createHydrationTestWorkspaceId();
const SECOND_ROW_ID = createHydrationTestWorkspaceId();
const REMOTE_ONLY_ROW_ID = createHydrationTestWorkspaceId();

const realFullSync = syncEngine.fullSync;
const { fullSyncIpc } = syncEngine;
/** Pull/push only these workspaces so tests stay fast when the test account has many remote rows. */
const HOME_SYNC = [HOME_ROW_ID];
const HOME_PLUS_SECOND_SYNC = [HOME_ROW_ID, SECOND_ROW_ID];

const realPullWorkspacePins = syncEngine.pullWorkspacePins;
const realPullCategories = syncEngine.pullCategories;
const realPullNotes = syncEngine.pullNotes;
const realPushWorkspaces = syncEngine.pushWorkspaces;
const realPushNotes = syncEngine.pushNotes;

async function mountPaidHydrated(): Promise<void> {
  renderHydrationHome();
  await waitFor(() => expect(getCanUseSupabase()).toBe(true), { timeout: 60_000 });
  await waitForHydrationCompleteAttr();
}

function probeVisibleCount(): string {
  return screen.getByTestId('hydration-probe').getAttribute('data-visible-count') ?? '';
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 4 — corrupted local state recovery', () => {
  it('A. malformed app state JSON falls back safely (no crash)', () => {
    clearPlainsightStorage();
    seedFreshHomeWorkspace();
    injectCorruptedAppStateRaw('{ not valid json');
    expect(() => loadAppState()).not.toThrow();
    expect(readAppStateVisibleCount()).toBeGreaterThanOrEqual(1);
    expect(() => renderHydrationHome()).not.toThrow();
  });

  it('B. invalid visible workspace entry is skipped; valid entries preserved', () => {
    clearPlainsightStorage();
    const id = createHydrationTestWorkspaceId();
    const key = `ws_visible_${id}`;
    injectPartiallyInvalidVisibleWorkspaceList({ id, name: 'GoodTab', key });
    setWorkspaceIdMapping(key, id);
    saveWorkspace(key, { categories: [], notes: [], archivedNotes: {} });
    saveWorkspace('workspace_home', { categories: [], notes: [], archivedNotes: {} });
    expect(readAppStateVisibleCount()).toBe(2);
    expect(loadAppState().visibleWorkspaces.some((e) => e.name === 'GoodTab')).toBe(true);
    expect(loadAppState().visibleWorkspaces.some((e) => e.name === 'CorruptTab')).toBe(false);
  });

  it('C. corrupted workspace blob yields safe default workspace data', () => {
    clearPlainsightStorage();
    seedFreshHomeWorkspace();
    injectCorruptedWorkspaceBlob('workspace_home', '{"notes":[broken}');
    const d = loadWorkspace('workspace_home');
    expect(d.notes).toEqual([]);
    expect(d.categories).toEqual([]);
  });

  it('D. corrupted localDB JSON for tombstones parses as empty (no throw on read)', async () => {
    clearPlainsightStorage();
    const wid = createHydrationTestWorkspaceId();
    injectUnreadableLocalDbJson(`plainsight_local_note_tombstones_${wid}`, '{not-json');
    await expect(localDB.getLocalNoteTombstones(wid)).resolves.toEqual([]);
  });
});

paidDescribe('Phase 4 — partial hydration & Supabase errors (syncEngine, no UI)', () => {
  beforeEach(async () => {
    clearPlainsightStorage();
    setWorkspaceIdMapping('workspace_home', HOME_ROW_ID);
    configurePaidUserTestMode();
    applyVitestPaidSyncFlags(true);
    seedFreshHomeWorkspace();
    await ensurePaidTestIdentity();
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home']);
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
  });

  afterEach(async () => {
    await deleteRemoteWorkspaceCascadeViaService(HOME_ROW_ID);
    await deleteRemoteWorkspaceCascadeViaService(SECOND_ROW_ID);
    await deleteRemoteWorkspaceCascadeViaService(REMOTE_ONLY_ROW_ID);
    syncHelpers.resetSyncQueueForTests();
    vi.restoreAllMocks();
  });

  it('2A. category pull error surfaces as failed fullSync', async () => {
    vi.spyOn(fullSyncIpc, 'pullCategories').mockResolvedValue({
      data: [],
      error: simulatedSyncError('phase4-categories-fail'),
    });
    const r = await realFullSync(HOME_SYNC);
    expect(r.ok).toBe(false);
  });

  it('2B. note pull error surfaces as failed fullSync', async () => {
    vi.spyOn(fullSyncIpc, 'pullNotes').mockResolvedValue({
      data: [],
      error: simulatedSyncError('phase4-notes-fail'),
    });
    const r = await realFullSync(HOME_SYNC);
    expect(r.ok).toBe(false);
  });

  it('2C. transient category error then success; workspace ids stay unique', async () => {
    let catCalls = 0;
    vi.spyOn(fullSyncIpc, 'pullCategories').mockImplementation(async (wid) => {
      catCalls += 1;
      if (catCalls === 1) {
        return { data: [], error: simulatedSyncError('phase4-retry') };
      }
      return realPullCategories(wid);
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(false);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    const rows = await localDB.getLocalWorkspaces();
    const ids = rows.map((x) => x.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('3A. pins pull error fails fullSync', async () => {
    vi.spyOn(fullSyncIpc, 'pullWorkspacePins').mockResolvedValue({
      data: [],
      error: simulatedSyncError('phase4-pins-outage'),
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(false);
  });

  it('3B. pushWorkspaces failure then success on next fullSync', async () => {
    let pushWsCalls = 0;
    vi.spyOn(fullSyncIpc, 'pushWorkspaces').mockImplementation(async (a, b) => {
      pushWsCalls += 1;
      if (pushWsCalls === 1) {
        return { ok: false, error: simulatedSyncError('phase4-ws-push-fail') };
      }
      return realPushWorkspaces(a, b);
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(false);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
  });

  it('3C. mid-sync note read error fails fullSync after a successful pass', async () => {
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    vi.spyOn(fullSyncIpc, 'pullNotes').mockResolvedValueOnce({
      data: [],
      error: simulatedSyncError('phase4-mid-read'),
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(false);
  });

  it('3D. transient pins error then successful fullSync', async () => {
    let pinCalls = 0;
    vi.spyOn(fullSyncIpc, 'pullWorkspacePins').mockImplementation(async () => {
      pinCalls += 1;
      if (pinCalls === 1) {
        return { data: [], error: simulatedSyncError('phase4-pins-transient') };
      }
      return realPullWorkspacePins();
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(false);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
  });
});

paidDescribe('Phase 4 — session expiration & workspace inconsistency (syncEngine, no UI)', () => {
  const userId = process.env.VITEST_SUPABASE_USER_ID!.trim();

  beforeEach(async () => {
    clearPlainsightStorage();
    setWorkspaceIdMapping('workspace_home', HOME_ROW_ID);
    configurePaidUserTestMode();
    applyVitestPaidSyncFlags(true);
    seedFreshHomeWorkspace();
    await ensurePaidTestIdentity();
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home']);
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
  });

  afterEach(async () => {
    await deleteRemoteWorkspaceCascadeViaService(HOME_ROW_ID);
    await deleteRemoteWorkspaceCascadeViaService(SECOND_ROW_ID);
    await deleteRemoteWorkspaceCascadeViaService(REMOTE_ONLY_ROW_ID);
    syncHelpers.resetSyncQueueForTests();
    vi.restoreAllMocks();
  });

  it('4A–C. invalid session stops paid sync path; pushNotes not invoked on gated fullSync', async () => {
    let pushCalls = 0;
    vi.spyOn(fullSyncIpc, 'pushNotes').mockImplementation(async (rows) => {
      pushCalls += 1;
      return realPushNotes(rows);
    });
    expect(getCanUseSupabase()).toBe(true);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    const n = pushCalls;
    invalidateVitestSession();
    expect(getCanUseSupabase()).toBe(false);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    expect(pushCalls).toBe(n);
  });

  it('4D. restoring session allows fullSync again', async () => {
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    invalidateVitestSession();
    expect(getCanUseSupabase()).toBe(false);
    await act(async () => {
      restoreVitestPaidSession();
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
    expect(getCanUseSupabase()).toBe(true);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
  });

  it('5A. visible tab exists locally; fullSync merge preserves both tabs in app state', async () => {
    const { visKey } = seedHomePlusVisibleWorkspaceWithRowId('Phase4Vis', SECOND_ROW_ID);
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', visKey]);
    expect((await realFullSync(HOME_PLUS_SECOND_SYNC)).ok).toBe(true);
    const vis = loadAppState().visibleWorkspaces;
    expect(vis.length).toBeGreaterThanOrEqual(2);
    expect(vis.some((e) => e.key === visKey)).toBe(true);
  });

  it('5B. remote-only workspace row hydrates into local list', async () => {
    await ensureRemoteWorkspaceRow({
      workspaceId: REMOTE_ONLY_ROW_ID,
      ownerId: userId,
      name: 'RemoteOrphan',
      kind: 'visible',
    });
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    const rows = await localDB.getLocalWorkspaces();
    expect(rows.some((w) => w.id === REMOTE_ONLY_ROW_ID)).toBe(true);
  });

  it('5C. remote workspace row removed mid-test; subsequent fullSync does not crash', async () => {
    await ensureRemoteWorkspaceRow({
      workspaceId: SECOND_ROW_ID,
      ownerId: userId,
      name: 'MidDelete',
      kind: 'visible',
    });
    const { visKey } = seedHomePlusVisibleWorkspaceWithRowId('MidDelTab', SECOND_ROW_ID);
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', visKey]);
    expect((await realFullSync(HOME_PLUS_SECOND_SYNC)).ok).toBe(true);
    await deleteRemoteWorkspaceCascadeViaService(SECOND_ROW_ID);
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
  });

  it('5D. workspace list has no duplicate ids after merge', async () => {
    expect((await realFullSync(HOME_SYNC)).ok).toBe(true);
    const merged = await localDB.getLocalWorkspaces();
    const ids = merged.map((m) => m.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.filter((w) => w.id === HOME_ROW_ID)).toHaveLength(1);
  });
});

describe('Phase 4 — corrupted app state before paid mount', () => {
  it('does not crash when app state was corrupted then paid bootstrap runs', async () => {
    if (!hasPaidEnv) return;
    clearPlainsightStorage();
    setWorkspaceIdMapping('workspace_home', HOME_ROW_ID);
    configurePaidUserTestMode();
    applyVitestPaidSyncFlags(true);
    seedFreshHomeWorkspace();
    injectCorruptedAppStateRaw('{{{');
    await ensurePaidTestIdentity();
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home']);
    await act(async () => {
      setSyncEntitlementActive(true);
      setSyncRemoteActive(true);
    });
    vi.spyOn(syncHelpers, 'runInitialHydration').mockImplementation(async () => {
      if (!getCanUseSupabase()) return;
      const url = (import.meta as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL;
      const key = (import.meta as { env?: { VITE_SUPABASE_ANON_KEY?: string } }).env
        ?.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) {
        notifyHydrationComplete({ ok: false });
        return;
      }
      const result = await realFullSync(HOME_SYNC);
      if (result && typeof result === 'object' && 'ok' in result && result.ok) {
        try {
          window.dispatchEvent(new CustomEvent('plainsight:full-sync'));
        } catch {
          /* ignore */
        }
      }
    });
    vi.spyOn(syncHelpers, 'queueFullSync').mockImplementation(() => {});
    vi.spyOn(syncEngine, 'subscribeToNotes').mockReturnValue(() => {});
    vi.spyOn(syncEngine, 'subscribeToCategories').mockReturnValue(() => {});
    vi.spyOn(syncEngine, 'subscribeToWorkspaces').mockReturnValue(() => {});
    vi.spyOn(syncEngine, 'subscribeToWorkspacePins').mockReturnValue(() => {});
    try {
      await expect(mountPaidHydrated()).resolves.not.toThrow();
      expect(Number(probeVisibleCount())).toBeGreaterThanOrEqual(1);
      expect(loadAppState().visibleWorkspaces.some((e) => e.key === 'workspace_home')).toBe(true);
    } finally {
      vi.restoreAllMocks();
      await deleteRemoteWorkspaceCascadeViaService(HOME_ROW_ID);
    }
  });
});
