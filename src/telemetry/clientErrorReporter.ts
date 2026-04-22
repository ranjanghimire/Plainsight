import { getCanUseSupabase } from '../sync/syncEnabled';
import { getSupabase } from '../sync/supabaseClient';
import {
  compressStack,
  safeRoutePath,
  sanitizeTelemetryText,
  telemetryFingerprint,
} from './sanitizeClientError';

const DEDUPE_MS = 120_000;
const lastSent = new Map<string, number>();

function appVersionLabel(): string {
  try {
    const v = (import.meta as { env?: { VITE_APP_VERSION?: string; MODE?: string } }).env;
    const explicit = v?.VITE_APP_VERSION?.trim();
    if (explicit) return explicit.slice(0, 160);
    return (v?.MODE || 'unknown').slice(0, 64);
  } catch {
    return 'unknown';
  }
}

function platformLabel(): string {
  try {
    if (typeof navigator === 'undefined') return '';
    const ua = navigator.userAgent || '';
    return sanitizeTelemetryText(ua, 240);
  } catch {
    return '';
  }
}

export type ClientErrorReportInput = {
  type: string;
  message: string;
  stack?: string | null;
};

/**
 * Sends a single sanitized row to `public.errors`. No-op when not entitled / no session.
 * Never throws to callers.
 */
export async function sendClientErrorReport(input: ClientErrorReportInput): Promise<void> {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
  if (!getCanUseSupabase()) return;

  const type = sanitizeTelemetryText(input.type || 'error', 80);
  const message = sanitizeTelemetryText(input.message || '', 2000);
  if (!message) return;

  const fp = telemetryFingerprint(type, message);
  const now = Date.now();
  const prev = lastSent.get(fp);
  if (prev != null && now - prev < DEDUPE_MS) return;
  lastSent.set(fp, now);
  if (lastSent.size > 200) {
    for (const [k, t] of lastSent) {
      if (now - t > DEDUPE_MS * 2) lastSent.delete(k);
    }
  }

  const stack = compressStack(input.stack ?? '', 18);

  try {
    await getSupabase().from('errors').insert({
      type,
      message,
      stack: stack || null,
      app_version: appVersionLabel(),
      platform: platformLabel() || null,
      route: safeRoutePath(),
    });
  } catch {
    /* ignore */
  }
}

function onWindowError(ev: ErrorEvent): void {
  const msg = ev.message || 'Script error';
  const stack = ev.error?.stack || `${msg}\n  at ${ev.filename}:${ev.lineno}:${ev.colno}`;
  void sendClientErrorReport({ type: 'window.error', message: msg, stack });
}

function onUnhandledRejection(ev: PromiseRejectionEvent): void {
  const reason = ev.reason;
  const message =
    reason instanceof Error
      ? reason.message || 'Unhandled rejection'
      : typeof reason === 'string'
        ? reason
        : 'Unhandled rejection';
  const stack = reason instanceof Error ? reason.stack : undefined;
  void sendClientErrorReport({ type: 'unhandledrejection', message, stack });
}

/**
 * Global handlers for window errors and unhandled promise rejections.
 */
export function installClientErrorReporter(): void {
  if (typeof window === 'undefined') return;
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return;
  if ((window as unknown as { __plainsightErrHook?: boolean }).__plainsightErrHook) return;
  (window as unknown as { __plainsightErrHook?: boolean }).__plainsightErrHook = true;
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
}
