const STORAGE_KEY = 'plainsight_shared_workspace_unread_v1';

export type SharedWorkspaceUnreadMap = Record<string, number>;

function safeParse(raw: string | null): SharedWorkspaceUnreadMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: SharedWorkspaceUnreadMap = {};
    for (const [k, ts] of Object.entries(v as Record<string, unknown>)) {
      const wid = String(k || '').trim();
      const n = typeof ts === 'number' ? ts : Number(ts);
      if (!wid) continue;
      if (!Number.isFinite(n) || n <= 0) continue;
      out[wid] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function readSharedWorkspaceUnread(): SharedWorkspaceUnreadMap {
  try {
    if (typeof localStorage === 'undefined') return {};
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeSharedWorkspaceUnread(map: SharedWorkspaceUnreadMap): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
  } catch {
    /* ignore */
  }
}

export function markSharedWorkspaceUnread(workspaceId: string, nowMs = Date.now()): SharedWorkspaceUnreadMap {
  const wid = String(workspaceId || '').trim();
  if (!wid) return readSharedWorkspaceUnread();
  const cur = readSharedWorkspaceUnread();
  cur[wid] = Math.max(1, nowMs);
  writeSharedWorkspaceUnread(cur);
  return cur;
}

export function clearSharedWorkspaceUnread(workspaceId: string): SharedWorkspaceUnreadMap {
  const wid = String(workspaceId || '').trim();
  if (!wid) return readSharedWorkspaceUnread();
  const cur = readSharedWorkspaceUnread();
  if (cur[wid] == null) return cur;
  delete cur[wid];
  writeSharedWorkspaceUnread(cur);
  return cur;
}

export function hasAnySharedWorkspaceUnread(map?: SharedWorkspaceUnreadMap | null): boolean {
  const m = map ?? readSharedWorkspaceUnread();
  return Object.keys(m).length > 0;
}

