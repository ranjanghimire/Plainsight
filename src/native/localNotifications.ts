import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

type NotifyArgs = {
  title: string;
  body: string;
  id?: number;
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

export async function notifyLocalPremium({ title, body, id }: NotifyArgs): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'ios') return;
  const ok = await ensurePermission();
  if (!ok) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: typeof id === 'number' ? id : nextId(),
          title,
          body,
          // "premium" feel on iOS is mostly copy + subtle sound; iOS controls visuals.
          sound: 'default',
          schedule: { at: new Date(Date.now() + 250) },
          extra: { source: 'shared_workspace_activity' },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

