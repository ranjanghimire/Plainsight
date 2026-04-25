const STORAGE_KEY = 'plainsight_shared_workspace_activity_watermark_v1';

type WatermarkMap = Record<string, string>;

function readMap(): WatermarkMap {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return {};
    const out: WatermarkMap = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const wid = String(k || '').trim();
      const iso = typeof val === 'string' ? val.trim() : '';
      if (!wid || !iso) continue;
      out[wid] = iso;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(m: WatermarkMap): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m || {}));
  } catch {
    /* ignore */
  }
}

export function getSharedWorkspaceActivityWatermark(workspaceId: string): string | null {
  const wid = String(workspaceId || '').trim();
  if (!wid) return null;
  const v = readMap()[wid];
  return v && v.trim() ? v.trim() : null;
}

/** Advance watermark to the later of the stored value and `createdAtIso` (ISO strings). */
export function bumpSharedWorkspaceActivityWatermark(workspaceId: string, createdAtIso: string): void {
  const wid = String(workspaceId || '').trim();
  const iso = String(createdAtIso || '').trim();
  if (!wid || !iso) return;
  const cur = readMap();
  const prev = cur[wid];
  const tNew = Date.parse(iso);
  if (!Number.isFinite(tNew)) return;
  if (prev) {
    const tPrev = Date.parse(prev);
    if (Number.isFinite(tPrev) && tPrev >= tNew) return;
  }
  cur[wid] = iso;
  writeMap(cur);
}

export function setSharedWorkspaceActivityWatermark(workspaceId: string, createdAtIso: string | null): void {
  const wid = String(workspaceId || '').trim();
  if (!wid) return;
  const cur = readMap();
  const iso = createdAtIso != null ? String(createdAtIso).trim() : '';
  if (!iso) {
    delete cur[wid];
  } else {
    cur[wid] = iso;
  }
  writeMap(cur);
}
