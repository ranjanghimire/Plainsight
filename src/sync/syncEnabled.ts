/**
 * Gating (Phases 3A–3C):
 * - syncEntitled: RevenueCat `sync` (setSyncEntitlementActive).
 * - supabaseSessionExists: valid Supabase session (Phase 3B AuthContext).
 * - syncRemoteActive: Phase 3C enables remote sync; until then app stays local-only.
 * - getCanUseSupabase: all three true — drives sync engine, hydration, fetches.
 */

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
let supabaseSessionExistsFlag = false;
/** Phase 3C: allow fullSync and realtime when true (persisted while user keeps cloud on). */
let syncRemoteActiveFlag = readPersistedSyncRemoteActive();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function getSyncEntitled(): boolean {
  return syncEntitledFlag;
}

export function getSupabaseSessionExists(): boolean {
  return supabaseSessionExistsFlag;
}

/** @internal Phase 3C only — until called with true, sync stays dormant. */
export function getSyncRemoteActive(): boolean {
  return syncRemoteActiveFlag;
}

export function getCanUseSupabase(): boolean {
  return syncEntitledFlag && supabaseSessionExistsFlag && syncRemoteActiveFlag;
}

/** @internal RevenueCat (SyncEntitlementContext). */
export function setSyncEntitlementActive(active: boolean): void {
  if (syncEntitledFlag === active) return;
  syncEntitledFlag = active;
  notify();
}

/** Phase 3B: AuthContext — session presence only; does not turn on sync. */
export function setSupabaseSessionExists(exists: boolean): void {
  if (supabaseSessionExistsFlag === exists) return;
  supabaseSessionExistsFlag = exists;
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
