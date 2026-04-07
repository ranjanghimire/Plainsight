/**
 * After OTP (or session restore), RevenueCat identifyUser must run when Purchases is ready.
 * Enqueue work here; SyncEntitlementProvider drains when RC is configured.
 */

export type OtpSessionQueueItem = {
  userId: string;
  email?: string;
  /** 'verify' = user just entered code; 'restore' = app reopened with saved session */
  source: 'verify' | 'restore';
  done?: () => void;
};

const queue: OtpSessionQueueItem[] = [];

const CHANGED = 'plainsight:otp-session-queue-changed';

export function enqueueOtpSessionProcessing(item: OtpSessionQueueItem): void {
  queue.push(item);
  try {
    window.dispatchEvent(new CustomEvent(CHANGED));
  } catch {
    /* ignore */
  }
}

export function drainOtpSessionQueue(): OtpSessionQueueItem[] {
  const out = [...queue];
  queue.length = 0;
  return out;
}

export const OTP_SESSION_QUEUE_CHANGED = CHANGED;
