import { fullSync } from './syncEngine';
import { getCanUseSupabase } from './syncEnabled';
import { notifyHydrationComplete } from './hydrationBridge';
import { recordFullSyncDurationMs, resetSyncLatencyWatchForTests } from '../telemetry/syncLatencyWatch';

/**
 * Quiet, non-blocking sync queue.
 * Debounces frequent edits and prevents overlapping fullSync runs.
 */

let pending = false;
let inFlight: Promise<unknown> | null = null;
let timer: number | null = null;

function readSupabaseEnv(): { url: string; key: string } | null {
  try {
    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return { url: String(url), key: String(key) };
  } catch {
    return null;
  }
}

async function canSync(): Promise<boolean> {
  try {
    if (!getCanUseSupabase()) return false;
    return readSupabaseEnv() != null;
  } catch {
    return false;
  }
}

async function run() {
  if (inFlight) return;
  if (!(await canSync())) return;
  pending = false;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  inFlight = fullSync()
    .then((result) => {
      if (result && typeof result === 'object' && 'ok' in result && result.ok) {
        const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        recordFullSyncDurationMs(t1 - t0);
        window.dispatchEvent(new CustomEvent('plainsight:full-sync'));
      }
    })
    .catch(() => {
      /* quiet */
    })
    .finally(() => {
      inFlight = null;
      if (pending) {
        // schedule another pass if we got edits while syncing
        queueFullSync();
      }
    });
}

export function queueFullSync() {
  if (!getCanUseSupabase()) return;
  pending = true;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    run();
  }, 320);
}

/**
 * First-load hydration: when sync is enabled, runs fullSync so workspaceIdMap exists before UI restore.
 * When sync is disabled, returns without notifying listeners (local state is already bootstrapped).
 * If sync cannot run (no env / no session), notifies so the UI can restore from local storage.
 */
export async function runInitialHydration(): Promise<void> {
  if (!getCanUseSupabase()) {
    return;
  }
  if (!(await canSync())) {
    notifyHydrationComplete({
      ok: false,
      reason: 'env_unavailable',
      message: 'Supabase env is unavailable (missing URL or anon key)',
    });
    return;
  }
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const result = await fullSync();
  if (result && typeof result === 'object' && 'ok' in result && result.ok) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordFullSyncDurationMs(t1 - t0);
  }
  if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
    notifyHydrationComplete({
      ok: false,
      reason: 'sync_failed',
      message: result.error?.message || 'Full sync failed',
      details: result.error?.details,
    });
  }
  // When hydration runs on-demand (e.g. after OTP verify + enabling cloud sync),
  // the UI needs the same refresh signal that `queueFullSync()` emits.
  if (result && typeof result === 'object' && 'ok' in result && result.ok) {
    try {
      window.dispatchEvent(new CustomEvent('plainsight:full-sync'));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Introspection for Vitest (entitlement-loss / sync harness). Not used in production UI.
 */
export function getSyncQueueStateForTests(): {
  pending: boolean;
  inFlight: boolean;
  debounceScheduled: boolean;
} {
  return {
    pending,
    inFlight: inFlight != null,
    debounceScheduled: timer != null,
  };
}

/** Vitest: clear debounced sync work so assertions stay deterministic after gating flips. */
export function resetSyncQueueForTests(): void {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  pending = false;
  inFlight = null;
  resetSyncLatencyWatchForTests();
}

