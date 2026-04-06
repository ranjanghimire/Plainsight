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

/** @internal RevenueCat (SyncEntitlementContext). */
export function setSyncEntitlementActive(active: boolean): void {
  if (syncEntitledFlag === active) return;
  syncEntitledFlag = active;
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
