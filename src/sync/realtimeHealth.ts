export type RealtimeHealthSnapshot = {
  connected: boolean;
  lastMessageAt: number | null;
  lastStatusAt: number | null;
  lastStatus: string | null;
};

type Listener = (s: RealtimeHealthSnapshot) => void;

let connected = false;
let lastMessageAt: number | null = null;
let lastStatusAt: number | null = null;
let lastStatus: string | null = null;
const listeners = new Set<Listener>();

function snapshot(): RealtimeHealthSnapshot {
  return { connected, lastMessageAt, lastStatusAt, lastStatus };
}

function emit() {
  const s = snapshot();
  for (const fn of listeners) {
    try {
      fn(s);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Subscribe to realtime health updates (best-effort; no guarantees).
 * Returns an unsubscribe function.
 */
export function onRealtimeHealthChange(fn: Listener): () => void {
  listeners.add(fn);
  try {
    fn(snapshot());
  } catch {
    /* ignore */
  }
  return () => {
    listeners.delete(fn);
  };
}

export function getRealtimeHealthSnapshot(): RealtimeHealthSnapshot {
  return snapshot();
}

/** Called by syncEngine channel subscriptions when a message arrives. */
export function recordRealtimeMessage(): void {
  lastMessageAt = Date.now();
  emit();
}

/** Called by syncEngine channel subscriptions when status changes. */
export function recordRealtimeStatus(status: string): void {
  lastStatus = status;
  lastStatusAt = Date.now();
  // Conservative: only treat SUBSCRIBED as "connected".
  connected = status === 'SUBSCRIBED';
  emit();
}

