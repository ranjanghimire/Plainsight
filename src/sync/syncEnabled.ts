/**
 * Gating (Phases 3A–3C + local session):
 * - syncEntitled: RevenueCat `sync` (setSyncEntitlementActive).
 * - supabaseSessionExists: local app session (src/auth/localSession.ts).
 * - syncRemoteActive: Phase 3C enables remote sync; until then app stays local-only.
 * - getCanUseSupabase: entitled + remote on + real OTP session (not local dev placeholders).
 *   Dev userId/token are not rows in public.users — pushing would violate workspaces_owner_id_fkey.
 */

import {
  getSession as getLocalSession,
  LOCAL_DEV_SESSION_TOKEN,
  LOCAL_DEV_USER_ID,
} from '../auth/localSession';

const ENTITLEMENT_KEY = 'sync';
const REMOTE_SYNC_STORAGE_KEY = 'plainsight_sync_remote_active';
/** Persisted hint for menu while session restore runs (`authReady` false). */
const LAST_KNOWN_MENU_SYNC_ENTITLED_KEY = 'plainsight_last_known_sync_entitled';

function writeLastKnownMenuSyncEntitled(value: boolean | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(LAST_KNOWN_MENU_SYNC_ENTITLED_KEY);
    else localStorage.setItem(LAST_KNOWN_MENU_SYNC_ENTITLED_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readPersistedSyncRemoteActive(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(REMOTE_SYNC_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let syncEntitledFlag = false;
/** Phase 3C: allow fullSync and realtime when true (persisted while user keeps cloud on). */
let syncRemoteActiveFlag = readPersistedSyncRemoteActive();
const listeners = new Set<() => void>();

/** True when credentials can reference rows in public.users (OTP session, not Phase 1 dev defaults). */
function sessionAllowsCloudData(): boolean {
  const { userId, sessionToken } = getLocalSession();
  if (!userId || !sessionToken) return false;
  if (userId === LOCAL_DEV_USER_ID || sessionToken === LOCAL_DEV_SESSION_TOKEN) return false;
  return true;
}

/** Turn off persisted remote sync if the current session cannot use Postgres user FKs. */
function clampRemoteSyncToSession(): void {
  if (!syncRemoteActiveFlag) return;
  if (sessionAllowsCloudData()) return;
  syncRemoteActiveFlag = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(REMOTE_SYNC_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function notify(): void {
  clampRemoteSyncToSession();
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  clampRemoteSyncToSession();
  window.addEventListener('plainsight:local-session', () => notify());
}

export function getSyncEntitled(): boolean {
  return syncEntitledFlag;
}

export function getSupabaseSessionExists(): boolean {
  return !!getLocalSession().userId;
}

/** @internal Phase 3C only — until called with true, sync stays dormant. */
export function getSyncRemoteActive(): boolean {
  return syncRemoteActiveFlag;
}

export function getCanUseSupabase(): boolean {
  return syncEntitledFlag && syncRemoteActiveFlag && sessionAllowsCloudData();
}

/** OTP / custom-auth session — not the Phase 1 local dev placeholder (menu, sign out). */
export function hasCustomAuthSession(): boolean {
  return sessionAllowsCloudData();
}

/**
 * Clears or sets the menu optimistic hint (e.g. after sign-out).
 * `null` removes the explicit key so the menu can fall back to remote-sync inference or "checking".
 */
export function persistLastKnownSyncEntitledForMenu(value: boolean | null): void {
  writeLastKnownMenuSyncEntitled(value);
}

/**
 * Last confirmed sync entitlement for optimistic menu copy while `authReady` is false.
 * - `true`: had paid sync entitlement before (show paid menu shell, verify in background).
 * - `false`: was not entitled (show "Sign in to sync" shell while verifying).
 * - `null`: no hint — show "Checking sign-in…".
 * If no explicit key exists, `plainsight_sync_remote_active` implies the user had cloud on → treat as `true`.
 */
export function getOptimisticLastKnownSyncEntitledForMenu(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LAST_KNOWN_MENU_SYNC_ENTITLED_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    if (readPersistedSyncRemoteActive()) return true;
    return null;
  } catch {
    return null;
  }
}

/** @internal RevenueCat (SyncEntitlementContext). */
export function setSyncEntitlementActive(active: boolean): void {
  if (syncEntitledFlag === active) return;
  syncEntitledFlag = active;
  writeLastKnownMenuSyncEntitled(active);
  notify();
}

/** Phase 3C: call when user enables cloud sync (after session + entitlement). */
export function setSyncRemoteActive(active: boolean): void {
  if (syncRemoteActiveFlag === active) return;
  syncRemoteActiveFlag = active;
  try {
    if (typeof localStorage !== 'undefined') {
      if (active) localStorage.setItem(REMOTE_SYNC_STORAGE_KEY, '1');
      else localStorage.removeItem(REMOTE_SYNC_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  notify();
}

export function subscribeSyncGating(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export const SYNC_ENTITLEMENT_ID = ENTITLEMENT_KEY;
