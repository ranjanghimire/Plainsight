/**
 * Phase 4 catastrophic recovery: inject corrupted localStorage, flip Supabase/session simulations.
 * No production imports that execute side effects beyond storage keys.
 */

import { clearSession, setSession } from '../../src/auth/localSession';
import type { SyncError } from '../../src/sync/types';
import { HOME_VISIBLE_ENTRY, type VisibleWorkspaceEntry } from '../categoryTestHarness';
import { APP_STATE_KEY, loadAppState } from '../../src/utils/storage';

export { APP_STATE_KEY };

export function simulatedSyncError(message: string): SyncError {
  return { message, details: { phase4: true } };
}

/** Raw `plainsight_app_state` payload (invalid JSON, truncated, etc.). */
export function injectCorruptedAppStateRaw(raw: string): void {
  localStorage.setItem(APP_STATE_KEY, raw);
}

/** Malformed JSON in a workspace blob key (`workspace_home`, `ws_visible_*`, …). */
export function injectCorruptedWorkspaceBlob(storageKey: string, raw: string): void {
  localStorage.setItem(storageKey, raw);
}

/** `visibleWorkspaces` includes one invalid entry; `normalizeVisibleWorkspacesList` drops it. */
export function injectPartiallyInvalidVisibleWorkspaceList(validSecond: VisibleWorkspaceEntry): void {
  localStorage.setItem(
    APP_STATE_KEY,
    JSON.stringify({
      visibleWorkspaces: [
        HOME_VISIBLE_ENTRY,
        { id: '', name: 'CorruptTab', key: 'ws_visible_bad' },
        validSecond,
      ],
      lastActiveStorageKey: 'workspace_home',
    }),
  );
}

/** Bypass `writeJson` so `JSON.parse` throws inside `readJson` paths. */
export function injectUnreadableLocalDbJson(key: string, raw: string): void {
  localStorage.setItem(key, raw);
}

export function readAppStateVisibleCount(): number {
  return loadAppState().visibleWorkspaces.length;
}

export function invalidateVitestSession(): void {
  clearSession();
  try {
    window.dispatchEvent(new CustomEvent('plainsight:local-session'));
  } catch {
    /* ignore */
  }
}

export function restoreVitestPaidSession(): void {
  const userId = process.env.VITEST_SUPABASE_USER_ID?.trim();
  const token = process.env.VITEST_SUPABASE_SESSION_TOKEN?.trim();
  if (!userId || !token) {
    throw new Error('restoreVitestPaidSession: missing VITEST_SUPABASE_USER_ID / VITEST_SUPABASE_SESSION_TOKEN');
  }
  setSession(token, userId);
  try {
    window.dispatchEvent(new CustomEvent('plainsight:local-session'));
  } catch {
    /* ignore */
  }
}
