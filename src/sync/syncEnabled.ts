/**
 * Gating (Phases 3A–3C + local session):
 * - syncEntitled: RevenueCat `sync` (setSyncEntitlementActive).
 * - supabaseSessionExists: local app session (src/auth/localSession.ts).
 * - syncRemoteActive: Phase 3C enables remote sync; until then app stays local-only.
 * - getCanUseSupabase: all three true — drives sync engine, hydration, fetches.
 */

import { getSession as getLocalSession } from '../auth/localSession';

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

function notify(): void {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
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
  return syncEntitledFlag && !!getLocalSession().userId && syncRemoteActiveFlag;
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
