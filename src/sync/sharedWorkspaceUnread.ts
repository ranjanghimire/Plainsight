const STORAGE_KEY = 'plainsight_shared_workspace_unread_v1';
const LAST_VIEWED_KEY = 'plainsight_shared_workspace_last_viewed_v1';

export type SharedWorkspaceUnreadMap = Record<string, number>;
export type SharedWorkspaceLastViewedMap = Record<string, number>;

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

function safeParseLastViewed(raw: string | null): SharedWorkspaceLastViewedMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: SharedWorkspaceLastViewedMap = {};
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

export function readSharedWorkspaceLastViewed(): SharedWorkspaceLastViewedMap {
  try {
    if (typeof localStorage === 'undefined') return {};
    return safeParseLastViewed(localStorage.getItem(LAST_VIEWED_KEY));
  } catch {
    return {};
  }
}

export function writeSharedWorkspaceLastViewed(map: SharedWorkspaceLastViewedMap): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify(map || {}));
  } catch {
    /* ignore */
  }
}

export function markSharedWorkspaceViewed(workspaceId: string, nowMs = Date.now()): SharedWorkspaceLastViewedMap {
  const wid = String(workspaceId || '').trim();
  if (!wid) return readSharedWorkspaceLastViewed();
  const cur = readSharedWorkspaceLastViewed();
  cur[wid] = Math.max(1, nowMs);
  writeSharedWorkspaceLastViewed(cur);
  return cur;
}

export function getSharedWorkspaceLastViewed(workspaceId: string): number {
  const wid = String(workspaceId || '').trim();
  if (!wid) return 0;
  const cur = readSharedWorkspaceLastViewed();
  const v = cur[wid];
  return Number.isFinite(v) ? v : 0;
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

