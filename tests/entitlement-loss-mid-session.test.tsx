/**
 * Entitlement loss mid-session: sync queue, hydration gating, no remote I/O after `getCanUseSupabase()` is false.
 * Requires Vitest Supabase env (same as paid hydration tests).
 */

import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  configurePaidUserTestMode,
  preparePaidRemoteWorkspaceRowsForKeys,
  seedFreshHomeWorkspace,
  switchToVisibleWorkspaceEntry,
} from './categoryTestHarness';
import {
  EntitlementLossProbe,
  renderEntitlementLossHome,
  waitForHydrationCompleteAttr,
} from './hydration/entitlementLossHarness';
import {
  applyVitestPaidSyncFlags,
  simulateEntitlementLossMidSession,
} from './hydration/entitlementLossTestUtils';
import { createHydrationTestWorkspaceId } from './hydration/hydrationTestIds';
import { seedHomePlusVisibleWorkspaceWithRowId } from './hydration/hydrationWorkspaceSeed';
import * as syncEngine from '../src/sync/syncEngine';
import * as syncHelpers from '../src/sync/syncHelpers';
import { getCanUseSupabase, setSyncEntitlementActive, setSyncRemoteActive } from '../src/sync/syncEnabled';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import {
  countNotesInWorkspace,
  deleteRemoteWorkspaceCascadeViaService,
  ensurePaidTestIdentity,
  insertNoteRowViaService,
} from './supabaseTestHelpers';
import {
  getOrCreateWorkspaceIdForStorageKey,
  getWorkspaceIdForStorageKey,
  loadAppState,
  loadWorkspace,
  setWorkspaceIdMapping,
} from '../src/utils/storage';

const realFullSync = syncEngine.fullSync;
const realPushNotes = syncEngine.pushNotes;

const hasPaidEnv = Boolean(
  process.env.VITEST_SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    process.env.VITEST_SUPABASE_USER_ID?.trim() &&
    process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim(),
);

const paidDescribe = hasPaidEnv ? describe : describe.skip;

const HOME_ROW_ID = createHydrationTestWorkspaceId();
const SECOND_VISIBLE_ROW_ID = createHydrationTestWorkspaceId();

/** Single wait so tests stay under Vitest `testTimeout` (sequential 60s + 90s gating/hydration caps exceeded 120s). */
async function waitForPaidHydrationReady(): Promise<void> {
  await waitFor(
    () => {
      expect(getCanUseSupabase()).toBe(true);
      const el = document.querySelector('[data-testid="hydration-probe"]');
      expect(el?.getAttribute('data-hydration-complete')).toBe('true');
    },
    { timeout: 120_000 },
  );
}

function readEntitlementProbeAttr(name: string): string | null {
  return screen.getByTestId('entitlement-loss-probe').getAttribute(name);
}

paidDescribe('entitlement loss — mid-session (Supabase)', () => {
  const userId = process.env.VITEST_SUPABASE_USER_ID!.trim();

  beforeEach(async () => {
    vi.restoreAllMocks();
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
    await deleteRemoteWorkspaceCascadeViaService(SECOND_VISIBLE_ROW_ID);
    resetSyncQueueForTests();
    vi.restoreAllMocks();
  });

  it('A. sync queue does not run fullSync after loss; explicit queueFullSync is a no-op', async () => {
    const fullSpy = vi.spyOn(syncEngine, 'fullSync').mockImplementation((...args: Parameters<typeof syncEngine.fullSync>) =>
      realFullSync(...args),
    );
    renderEntitlementLossHome();
    await waitForPaidHydrationReady();
    const callsAfterHydrate = fullSpy.mock.calls.length;
    await simulateEntitlementLossMidSession();
    expect(readEntitlementProbeAttr('data-can-use-supabase')).toBe('false');
    await act(async () => {
      syncHelpers.queueFullSync();
    });
    const q = syncHelpers.getSyncQueueStateForTests();
    expect(q.inFlight).toBe(false);
    expect(fullSpy.mock.calls.length).toBe(callsAfterHydrate);
    fullSpy.mockRestore();
  });

  it('B. after loss, no further fullSync runs from the app shell', async () => {
    const fsSpy = vi.spyOn(syncEngine, 'fullSync').mockImplementation((...args: Parameters<typeof syncEngine.fullSync>) =>
      realFullSync(...args),
    );
    renderEntitlementLossHome();
    await waitForPaidHydrationReady();
    const fsAfter = fsSpy.mock.calls.length;
    await simulateEntitlementLossMidSession();
    expect(readEntitlementProbeAttr('data-hydration-complete')).toBe('true');
    await act(async () => {
      await Promise.resolve();
    });
    expect(fsSpy.mock.calls.length).toBe(fsAfter);
    fsSpy.mockRestore();
  });

  it('C. after loss, remote inserts do not change local note count (no realtime / no sync)', async () => {
    const fsSpy = vi.spyOn(syncEngine, 'fullSync').mockImplementation((...args: Parameters<typeof syncEngine.fullSync>) =>
      realFullSync(...args),
    );
    renderEntitlementLossHome();
    await waitForPaidHydrationReady();
    const wid = getWorkspaceIdForStorageKey('workspace_home') ?? getOrCreateWorkspaceIdForStorageKey('workspace_home');
    await simulateEntitlementLossMidSession();
    const n0 = fsSpy.mock.calls.length;
    const t0 = new Date().toISOString();
    await insertNoteRowViaService({
      id: crypto.randomUUID(),
      workspace_id: wid,
      text: 'device-a-after-loss',
      created_at: t0,
      updated_at: t0,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('0');
    expect(fsSpy.mock.calls.length).toBe(n0);
    fsSpy.mockRestore();
  });

  it(
    'D. after loss, local edits do not trigger remote note writes',
    async () => {
      const pushSpy = vi.spyOn(syncEngine.fullSyncIpc, 'pushNotes').mockImplementation((...args) =>
        realPushNotes(...args),
      );
      renderEntitlementLossHome();
      await waitForPaidHydrationReady();
      const wid =
        getWorkspaceIdForStorageKey('workspace_home') ??
        getOrCreateWorkspaceIdForStorageKey('workspace_home');
      const remoteCountBefore = await countNotesInWorkspace(wid);
      await simulateEntitlementLossMidSession();
      const pushCallsAfterLoss = pushSpy.mock.calls.length;
      const user = userEvent.setup();
      const box = screen.getByLabelText('New note');
      await user.type(box, 'local-only-note');
      await user.click(screen.getByRole('button', { name: 'Add note' }));
      await waitFor(
        () => expect((loadWorkspace('workspace_home').notes || []).length).toBe(1),
        { timeout: 90_000 },
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(pushSpy.mock.calls.length).toBe(pushCallsAfterLoss);
      expect(await countNotesInWorkspace(wid)).toBe(remoteCountBefore);
      pushSpy.mockRestore();
    },
    240_000,
  );

  it(
    'E. fullSync while not entitled does not merge remote rows into local workspace blob',
    async () => {
      renderEntitlementLossHome();
      await waitForPaidHydrationReady();
      const wid =
        getWorkspaceIdForStorageKey('workspace_home') ??
        getOrCreateWorkspaceIdForStorageKey('workspace_home');
      const t0 = new Date().toISOString();
      await insertNoteRowViaService({
        id: crypto.randomUUID(),
        workspace_id: wid,
        text: 'only-remote',
        created_at: t0,
        updated_at: t0,
      });
      await act(async () => {
        await realFullSync();
      });
      await waitFor(
        () => expect((loadWorkspace('workspace_home').notes || []).length).toBe(1),
        { timeout: 90_000 },
      );
      await act(async () => {
        window.dispatchEvent(new CustomEvent('plainsight:full-sync'));
      });
      await simulateEntitlementLossMidSession();
      const blob = loadWorkspace('workspace_home');
      await act(async () => {
        await realFullSync();
      });
      expect(loadWorkspace('workspace_home')).toEqual(blob);
      expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('1');
    },
    240_000,
  );

  it('F. after loss, switching visible workspace stays local-only (no new fullSync)', async () => {
    const { visKey } = seedHomePlusVisibleWorkspaceWithRowId('LossTab', SECOND_VISIBLE_ROW_ID);
    await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home', visKey]);
    const fsSpy = vi.spyOn(syncEngine, 'fullSync').mockImplementation((...args: Parameters<typeof syncEngine.fullSync>) =>
      realFullSync(...args),
    );
    renderEntitlementLossHome();
    await waitForPaidHydrationReady();
    await simulateEntitlementLossMidSession();
    const n = fsSpy.mock.calls.length;
    const { visibleWorkspaces } = loadAppState();
    const second = visibleWorkspaces.find((e: { key: string }) => e.key === visKey);
    expect(second).toBeTruthy();
    await switchToVisibleWorkspaceEntry(second!);
    await waitFor(() =>
      expect(screen.getByTestId('hydration-probe').getAttribute('data-active-key')).toBe(visKey),
    );
    expect(fsSpy.mock.calls.length).toBe(n);
    fsSpy.mockRestore();
  });

  it('G. reload in free mode: no paid fullSync, local notes preserved', async () => {
    const fsSpy = vi.spyOn(syncEngine, 'fullSync').mockImplementation((...args: Parameters<typeof syncEngine.fullSync>) =>
      realFullSync(...args),
    );
    const r = renderEntitlementLossHome();
    await waitForPaidHydrationReady();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('New note'), 'persist-after-reload');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('1'),
    );
    await simulateEntitlementLossMidSession();
    const callsAfterLoss = fsSpy.mock.calls.length;
    r.unmount();
    configureFreeUserTestMode();
    applyVitestPaidSyncFlags(false);
    renderEntitlementLossHome();
    await waitForHydrationCompleteAttr();
    expect(readEntitlementProbeAttr('data-can-use-supabase')).toBe('false');
    expect(fsSpy.mock.calls.length).toBe(callsAfterLoss);
    expect(screen.getByTestId('note-count-probe').getAttribute('data-note-count')).toBe('1');
    fsSpy.mockRestore();
  });
});

describe('entitlement loss — local-only probe (no Supabase)', () => {
  it('probe reports free mode after configureFreeUserTestMode', async () => {
    clearPlainsightStorage();
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
    renderEntitlementLossHome();
    await waitForHydrationCompleteAttr();
    expect(readEntitlementProbeAttr('data-can-use-supabase')).toBe('false');
    expect(readEntitlementProbeAttr('data-hydration-complete')).toBe('true');
  });
});
