export type HydrationCompletePayload = {
  /** Whether fullSync completed without a top-level failure (some steps may still have been skipped). */
  ok: boolean;
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
