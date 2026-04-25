import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export type SharedWorkspaceActivityPayload = {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  newRow: {
    actor_user_id?: string;
    action?: string;
  } | null;
  oldRow: unknown | null;
};

export function shouldMarkUnreadForSharedActivity(args: {
  payload: SharedWorkspaceActivityPayload;
  myUserId: string;
  workspaceId: string;
  activeWorkspaceId: string | null;
}): boolean {
  const row = args.payload?.newRow;
  const actor = row?.actor_user_id ? String(row.actor_user_id) : '';
  if (!actor || actor === String(args.myUserId)) return false;
  const activeId = args.activeWorkspaceId ? String(args.activeWorkspaceId) : '';
  if (activeId && activeId === String(args.workspaceId)) return false;
  return true;
}

export function shouldScheduleIosLocalNotificationForSharedNoteActivity(args: {
  action: string;
}): boolean {
  const a = String(args.action || '').trim();
  return a === 'note_added' || a === 'note_updated';
}

export function formatSharedWorkspaceNoteNotificationBody(args: {
  action: string;
  workspaceName: string;
}): string {
  const a = String(args.action || '').trim();
  const verb = a === 'note_added' ? 'created' : 'updated';
  const name = String(args.workspaceName || 'Workspace').trim() || 'Workspace';
  return `A note was ${verb} in ‘${name}’.`;
}

/**
 * Native: WKWebView `document.visibilityState` is not a reliable proxy for app foreground/background.
 * Use Capacitor App state so local notifications still schedule when the app is backgrounded.
 */
export async function isNativeAppInactiveForNotifications(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const st = await App.getState();
    return st?.isActive !== true;
  } catch {
    return true;
  }
}
