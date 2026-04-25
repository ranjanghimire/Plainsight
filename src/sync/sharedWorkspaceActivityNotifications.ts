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

/** Title + body tuned for a short lock-screen read; iOS shows title prominently above body. */
export function formatSharedWorkspaceCollaborationNotification(args: {
  action: string;
  workspaceName: string;
  workspaceId: string;
}): {
  title: string;
  body: string;
  threadIdentifier: string;
  summaryArgument: string;
} {
  const name = String(args.workspaceName || 'Shared workspace').trim() || 'Shared workspace';
  const wid = String(args.workspaceId || '').trim() || 'unknown';
  const a = String(args.action || '').trim();
  const isAdd = a === 'note_added';
  const title =
    name.length > 48 ? `${name.slice(0, 45).trimEnd()}…` : name;
  const body = isAdd
    ? 'A collaborator added a new note.'
    : 'A collaborator updated a note.';
  return {
    title,
    body,
    threadIdentifier: `plainsight.workspace.${wid}`,
    summaryArgument: name.length > 32 ? `${name.slice(0, 29)}…` : name,
  };
}
