import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

type NotifyArgs = {
  title: string;
  body: string;
  id?: number;
  /** iOS: groups updates in Notification Center / lock screen. */
  threadIdentifier?: string;
  /** iOS: shown in grouped summary lines. */
  summaryArgument?: string;
  /**
   * Delay before fire. Omit or 0 for immediate delivery (preferred when the app is backgrounded
   * so iOS can show the banner right away instead of deferring a sub-second schedule).
   */
  delayMs?: number;
};

let permissionChecked = false;
let permissionGranted = false;

/** Call after login / when shared workspaces exist so iOS can prompt before first remote event. */
export async function prefetchLocalNotificationPermission(): Promise<boolean> {
  return ensurePermission();
}

async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') {
      permissionGranted = true;
      return true;
    }
    const req = await LocalNotifications.requestPermissions();
    permissionGranted = req.display === 'granted';
    return permissionGranted;
  } catch {
    permissionGranted = false;
    return false;
  }
}

function nextId(): number {
  // Keep ids stable-ish but unique enough for our usage.
  return Math.floor(Date.now() % 2_000_000_000);
}

export async function notifyLocalPremium({
  title,
  body,
  id,
  threadIdentifier,
  summaryArgument,
  delayMs,
}: NotifyArgs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'ios') return;
  const ok = await ensurePermission();
  if (!ok) return;

  try {
    const notification: {
      id: number;
      title: string;
      body: string;
      sound: string;
      extra: Record<string, string>;
      threadIdentifier?: string;
      summaryArgument?: string;
      schedule?: { at: Date };
    } = {
      id: typeof id === 'number' ? id : nextId(),
      title,
      body,
      sound: 'default',
      extra: { source: 'shared_workspace_activity' },
    };
    if (threadIdentifier) notification.threadIdentifier = threadIdentifier;
    if (summaryArgument) notification.summaryArgument = summaryArgument;
    const ms = typeof delayMs === 'number' && Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
    if (ms > 0) {
      notification.schedule = { at: new Date(Date.now() + ms) };
    }
    await LocalNotifications.schedule({
      notifications: [notification],
    });
  } catch {
    /* ignore */
  }
}

