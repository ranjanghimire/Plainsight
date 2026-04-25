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
