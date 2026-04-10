/**
 * Home (NotesView) harness: local storage reset, free/paid gating flags, MemoryRouter, providers.
 */

import React, { useLayoutEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { clearSession, ensureLocalSession, setSession } from '../src/auth/localSession';
import { HomePage } from '../src/pages/HomePage';
import { AuthProvider } from '../src/context/AuthContext';
import { ArchiveModeProvider } from '../src/context/ArchiveModeContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { useWorkspace, WorkspaceProvider } from '../src/context/WorkspaceContext';
import {
  setSyncEntitlementActive,
  setSyncRemoteActive,
  getCanUseSupabase,
} from '../src/sync/syncEnabled';
import { fullSync } from '../src/sync/syncEngine';
import { flushWorkspaceUiIntoLocalDb } from '../src/sync/workspaceStorageBridge';
import {
  defaultVisibleWorkspaces,
  getDefaultWorkspaceData,
  getOrCreateWorkspaceIdForStorageKey,
  getWorkspaceIdForStorageKey,
  loadWorkspace,
  saveAppState,
  setWorkspaceIdMapping,
  VISIBLE_WS_PREFIX,
  saveWorkspace,
} from '../src/utils/storage';
import {
  ensurePaidTestIdentity,
  ensureRemoteWorkspaceRow,
} from './supabaseTestHelpers';

export function clearPlainsightStorage(): void {
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (
        k.startsWith('plainsight') ||
        k.startsWith('workspace_') ||
        k.startsWith('ws_visible_') ||
        k === 'masterKey'
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

export function seedFreshHomeWorkspace(): void {
  const vis = defaultVisibleWorkspaces();
  saveAppState(vis, 'workspace_home');
  saveWorkspace('workspace_home', getDefaultWorkspaceData());
}

export function readHomeCategories(): string[] {
  return readWorkspaceCategories('workspace_home');
}

/** Categories list from a workspace localStorage blob (`workspace_home`, `ws_visible_*`, `workspace_*`). */
export function readWorkspaceCategories(storageKey: string): string[] {
  const d = loadWorkspace(storageKey);
  return Array.isArray(d.categories) ? [...d.categories] : [];
}

export type VisibleWorkspaceEntry = { id: string; name: string; key: string };

export const HOME_VISIBLE_ENTRY: VisibleWorkspaceEntry = {
  id: 'home',
  name: 'Home',
  key: 'workspace_home',
};

/**
 * Ref populated by `WorkspaceTestBridge` inside `renderHomePage` for switching workspaces in tests.
 */
export const workspaceTestHandlesRef: {
  current: {
    switchVisibleWorkspace: (e: VisibleWorkspaceEntry) => void;
    switchWorkspace: (name: string) => void;
  } | null;
} = { current: null };

export function WorkspaceTestBridge(): null {
  const w = useWorkspace();
  useLayoutEffect(() => {
    workspaceTestHandlesRef.current = {
      switchVisibleWorkspace: w.switchVisibleWorkspace,
      switchWorkspace: w.switchWorkspace,
    };
    return () => {
      workspaceTestHandlesRef.current = null;
    };
  }, [w.switchVisibleWorkspace, w.switchWorkspace]);
  return null;
}

/** Home + second menu-visible tab (empty default data). */
export function seedHomePlusVisibleWorkspace(secondTabName = 'BetaTab'): {
  entry: VisibleWorkspaceEntry;
  visKey: string;
} {
  const id = uuidv4();
  const key = `${VISIBLE_WS_PREFIX}${id}`;
  setWorkspaceIdMapping(key, id);
  saveWorkspace('workspace_home', getDefaultWorkspaceData());
  saveWorkspace(key, getDefaultWorkspaceData());
  const entry: VisibleWorkspaceEntry = { id, name: secondTabName, key };
  saveAppState([HOME_VISIBLE_ENTRY, entry], 'workspace_home');
  return { entry, visKey: key };
}

/**
 * Home + legacy hidden blob `workspace_<slug>`; switch with `switchWorkspace('hid_slug')` (slug without `workspace_`).
 */
export function seedHomePlusHiddenWorkspace(slug = 'hidtest'): {
  hiddenKey: string;
  switchName: string;
} {
  const hiddenKey = `workspace_${slug}`;
  saveWorkspace('workspace_home', getDefaultWorkspaceData());
  saveWorkspace(hiddenKey, getDefaultWorkspaceData());
  saveAppState(defaultVisibleWorkspaces(), 'workspace_home');
  return { hiddenKey, switchName: slug };
}

const WORKSPACE_SWITCH_SETTLE_MS = 400;

/** Paid mode schedules `queueFullSync` on workspace switch; wait before an explicit push to avoid racing fullSync. */
export async function settlePaidSyncAfterWorkspaceSwitch(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
}

export async function switchToVisibleWorkspaceEntry(entry: VisibleWorkspaceEntry): Promise<void> {
  await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
  const h = workspaceTestHandlesRef.current!;
  await act(async () => {
    h.switchVisibleWorkspace(entry);
  });
  await new Promise((r) => setTimeout(r, WORKSPACE_SWITCH_SETTLE_MS));
}

export async function switchToHiddenWorkspaceName(name: string): Promise<void> {
  await waitFor(() => expect(workspaceTestHandlesRef.current).toBeTruthy());
  const h = workspaceTestHandlesRef.current!;
  await act(async () => {
    h.switchWorkspace(name);
  });
  await new Promise((r) => setTimeout(r, WORKSPACE_SWITCH_SETTLE_MS));
}

export async function pushHomeWorkspaceToSupabase(): Promise<void> {
  await pushWorkspaceToSupabase('workspace_home');
}

export async function pushWorkspaceToSupabase(storageKey: string): Promise<void> {
  if (!getCanUseSupabase()) {
    throw new Error('pushWorkspaceToSupabase requires paid+sync-active session (getCanUseSupabase)');
  }
  const wid = getOrCreateWorkspaceIdForStorageKey(storageKey);
  await flushWorkspaceUiIntoLocalDb(wid);
  const r = await fullSync();
  if (!r?.ok) throw new Error(`fullSync failed: ${JSON.stringify(r?.error)}`);
}

/** UUID bound to a storage key after seed/sync (prefer map over creating a new id). */
export function workspaceUuidForStorageKey(storageKey: string): string {
  return getWorkspaceIdForStorageKey(storageKey) ?? getOrCreateWorkspaceIdForStorageKey(storageKey);
}

export function configureFreeUserTestMode(): void {
  globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
  clearSession();
  ensureLocalSession();
  setSyncEntitlementActive(false);
  setSyncRemoteActive(false);
}

export function configurePaidUserTestMode(): void {
  const userId = process.env.VITEST_SUPABASE_USER_ID?.trim();
  const token = process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim();
  if (!userId || !token) {
    throw new Error('configurePaidUserTestMode requires VITEST_SUPABASE_USER_ID and VITEST_SUPABASE_SESSION_TOKEN');
  }
  globalThis.__PS_TEST_FLAGS__ = { paidSync: true, sessionUserId: userId };
  clearSession();
  setSession(token, userId);
}

/**
 * After `seedFreshHomeWorkspace()`, upserts DB rows so paid sync passes RLS (`sessions` / `users`)
 * and category FKs see a `workspaces` row for the home UUID.
 */
export async function preparePaidUserRemoteFixtures(): Promise<void> {
  await preparePaidRemoteWorkspaceRowsForKeys(['workspace_home']);
}

/** Ensures `workspaces` rows exist for every storage key (home, `ws_visible_*`, hidden `workspace_*`). */
export async function preparePaidRemoteWorkspaceRowsForKeys(storageKeys: string[]): Promise<void> {
  await ensurePaidTestIdentity();
  const userId = process.env.VITEST_SUPABASE_USER_ID?.trim();
  if (!userId) throw new Error('preparePaidRemoteWorkspaceRowsForKeys: VITEST_SUPABASE_USER_ID missing');
  for (const sk of storageKeys) {
    const wid = getOrCreateWorkspaceIdForStorageKey(sk);
    const isHome = sk === 'workspace_home';
    const isMenuVisible = sk.startsWith(VISIBLE_WS_PREFIX);
    const name = isHome ? 'Home' : isMenuVisible ? `Vis-${wid.slice(0, 8)}` : `Hid-${wid.slice(0, 8)}`;
    const kind = isHome || isMenuVisible ? 'visible' : 'hidden';
    await ensureRemoteWorkspaceRow({ workspaceId: wid, ownerId: userId, name, kind });
  }
}

export function renderHomePage(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter initialEntries={['/']}>
              <WorkspaceTestBridge />
              <ArchiveModeProvider>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                </Routes>
              </ArchiveModeProvider>
            </MemoryRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

/**
 * Wait until category chips mount.
 * Paid tests pass `expectPaidSync` so we wait for `getCanUseSupabase()` after hydration/OTP wiring.
 */
export async function waitForCategoryRowReady(options?: {
  expectPaidSync?: boolean;
}): Promise<void> {
  await waitFor(
    () => {
      expect(document.querySelector('[data-testid="category-chips-row"]')).toBeTruthy();
    },
    { timeout: 45_000 },
  );
  if (options?.expectPaidSync) {
    await waitFor(() => expect(getCanUseSupabase()).toBe(true), { timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 1500));
  }
}
