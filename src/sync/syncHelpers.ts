import { fullSync } from './syncEngine';
import { supabase } from './supabaseClient';
import { getCanUseSupabase } from './syncEnabled';
import { notifyHydrationComplete } from './hydrationBridge';

/**
 * Quiet, non-blocking sync queue.
 * Debounces frequent edits and prevents overlapping fullSync runs.
 */

let pending = false;
let inFlight: Promise<unknown> | null = null;
let timer: number | null = null;

async function canSync(): Promise<boolean> {
  // Avoid throwing if env isn't configured.
  try {
    // If URL/key missing, supabase client exists but calls will fail noisily.
    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return false;

    const { data } = await supabase.auth.getSession();
    return !!data.session?.user;
  } catch {
    return false;
  }
}

async function run() {
  if (inFlight) return;
  if (!(await canSync())) return;
  pending = false;
  inFlight = fullSync()
    .then((result) => {
      if (result && typeof result === 'object' && 'ok' in result && result.ok) {
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
  }, 500);
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
    notifyHydrationComplete({ ok: false });
    return;
  }
  await fullSync();
}

