import { sendClientErrorReport } from './clientErrorReporter';

/** Rolling window of successful `fullSync` wall times (ms). */
const WINDOW_SIZE = 8;
/** Require this many samples before comparing to the threshold. */
const MIN_SAMPLES = 5;
/** Alert when the rolling mean exceeds this (ms). Tunable product threshold. */
const AVG_THRESHOLD_MS = 20_000;
/** Do not spam `public.errors` if the client stays in a bad state. */
const ALERT_COOLDOWN_MS = 10 * 60_000;

const samples: number[] = [];
let lastAlertAt = 0;

/**
 * Record one successful full-sync duration. When the rolling average stays above
 * {@link AVG_THRESHOLD_MS}, emits a single deduped telemetry row (`sync.latency_degraded`).
 */
export function recordFullSyncDurationMs(durationMs: number): void {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return;
  samples.push(durationMs);
  if (samples.length > WINDOW_SIZE) samples.shift();
  if (samples.length < MIN_SAMPLES) return;

  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (avg <= AVG_THRESHOLD_MS) return;

  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;

  const rounded = samples.map((x) => Math.round(x));
  const msg = `rollingAvgFullSyncMs=${Math.round(avg)} thresholdMs=${AVG_THRESHOLD_MS} window=${samples.length} recentMs=${rounded.join(',')}`;

  void sendClientErrorReport({
    type: 'sync.latency_degraded',
    message: msg,
    stack: JSON.stringify({ windowSize: WINDOW_SIZE, minSamples: MIN_SAMPLES }),
  });
}

/** Vitest / harness: clear rolling state. */
export function resetSyncLatencyWatchForTests(): void {
  samples.length = 0;
  lastAlertAt = 0;
}
