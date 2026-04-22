export type HydrationCompletePayload = {
  /** Whether fullSync completed without a top-level failure (some steps may still have been skipped). */
  ok: boolean;
  /**
   * Best-effort classification for diagnostics / telemetry. Intended for UI + logging only.
   * - `env_unavailable`: supabase url/key missing at runtime.
   * - `sync_failed`: fullSync returned ok:false or threw.
   */
  reason?: 'env_unavailable' | 'sync_failed';
  /** Human-readable failure message when `ok` is false. */
  message?: string;
  /** Optional extra details (will be sanitized before telemetry). */
  details?: unknown;
};

type Listener = (payload: HydrationCompletePayload) => void;

const listeners = new Set<Listener>();

export function subscribeHydrationComplete(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function notifyHydrationComplete(payload: HydrationCompletePayload): void {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  }
}
