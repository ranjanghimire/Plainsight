/**
 * When the app was killed or realtime missed inserts, `workspace_activity_logs`
 * are polled once after hydration (and on tab focus) to restore shared-workspace badges.
 */

export type ActivityLogCatchupRow = {
  actor_user_id: string;
  created_at: string;
};

export type ActivityBadgeCatchupResult = {
  shouldMarkUnread: boolean;
  /** When non-null, persist as the activity watermark for this workspace. */
  nextWatermarkIso: string | null;
};

function parseMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Pure helper: given fetched activity rows (newest-first or any order), decide whether to
 * show the shared-workspace unread badge and advance the per-workspace watermark.
 */
export function computeActivityBadgeCatchup(
  logs: ActivityLogCatchupRow[],
  prevWatermarkIso: string | null,
  args: {
    myUserId: string;
    workspaceId: string;
    activeWorkspaceId: string | null;
  },
): ActivityBadgeCatchupResult {
  if (!logs.length) {
    return { shouldMarkUnread: false, nextWatermarkIso: null };
  }

  let newestMs = -Infinity;
  let newestIso: string | null = null;
  for (const log of logs) {
    const t = parseMs(log.created_at);
    if (Number.isFinite(t) && t > newestMs) {
      newestMs = t;
      newestIso = log.created_at;
    }
  }

  if (!newestIso || !Number.isFinite(newestMs)) {
    return { shouldMarkUnread: false, nextWatermarkIso: prevWatermarkIso };
  }

  const prevMs = parseMs(prevWatermarkIso);
  const hasPrev = Number.isFinite(prevMs);

  if (!hasPrev) {
    return {
      shouldMarkUnread: false,
      nextWatermarkIso: new Date(newestMs).toISOString(),
    };
  }

  const myId = String(args.myUserId || '');
  const wid = String(args.workspaceId || '');
  const activeId = args.activeWorkspaceId ? String(args.activeWorkspaceId) : '';

  let shouldMarkUnread = false;
  for (const log of logs) {
    const t = parseMs(log.created_at);
    if (!Number.isFinite(t) || t <= prevMs) continue;
    const actor = String(log.actor_user_id || '');
    if (!actor || actor === myId) continue;
    if (activeId && activeId === wid) continue;
    shouldMarkUnread = true;
    break;
  }

  const nextMs = Math.max(prevMs, newestMs);
  return {
    shouldMarkUnread,
    nextWatermarkIso: new Date(nextMs).toISOString(),
  };
}
