import { pruneArchivedNotesUi } from './archivedPrune';
import { MAX_ARCHIVED_ITEMS_PER_WORKSPACE } from '../constants/workspaceLimits';
import { archivedRowIdForText } from './archivedIds';
import {
  getLocalArchivedNoteTombstones,
  saveLocalArchivedNoteTombstones,
} from '../sync/localDB';
import { getSession as getLocalSession } from '../auth/localSession';

const WORKSPACE_PREFIX = 'workspace_';
const MASTER_KEY = 'masterKey';

/**
 * Blocklist of slugs that belong to accepted shared workspaces.
 * Used to prevent legacy hidden blobs (`workspace_<slug>`) from being created for shared workspaces,
 * which would incorrectly surface them under /manage.
 */
const SHARED_HIDDEN_SLUG_BLOCKLIST_KEY = 'plainsight_shared_hidden_slug_blocklist_v1';

function readSharedHiddenSlugBlocklist() {
  try {
    const raw = localStorage.getItem(SHARED_HIDDEN_SLUG_BLOCKLIST_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function isBlockedLegacyHiddenWorkspaceKey(key) {
  if (!isLegacyHiddenWorkspaceKey(key)) return false;
  const slug = slugFromLegacyHiddenStorageKey(key);
  if (!slug) return false;
  const blocked = readSharedHiddenSlugBlocklist();
  return blocked.has(String(slug));
}

/** App-level state: visible workspace list + last active storage key */
export const APP_STATE_KEY = 'plainsight_app_state';

/** Storage keys for workspaces created from the Menu (not dot-commands) */
export const VISIBLE_WS_PREFIX = 'ws_visible_';

export function defaultVisibleWorkspaces() {
  return [{ id: 'home', name: 'Home', key: 'workspace_home' }];
}

function normalizeVisibleEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const id = typeof x.id === 'string' ? x.id : null;
  const name = typeof x.name === 'string' ? x.name : null;
  const key = typeof x.key === 'string' ? x.key : null;
  if (!id || !name || !key) return null;
  return { id, name, key };
}

export function normalizeVisibleWorkspacesList(arr) {
  const raw = Array.isArray(arr)
    ? arr.map(normalizeVisibleEntry).filter(Boolean)
    : [];
  const homeIdx = raw.findIndex(
    (e) => e.id === 'home' || e.key === 'workspace_home',
  );
  let home =
    homeIdx >= 0
      ? { ...raw[homeIdx], id: 'home', name: 'Home', key: 'workspace_home' }
      : null;
  if (!home) home = defaultVisibleWorkspaces()[0];
  const rest = raw.filter(
    (e) => e.id !== 'home' && e.key !== 'workspace_home',
  );
  return [home, ...rest];
}

/** True if this localStorage workspace key is a Menu-visible workspace (Home or a visible tab), not hidden/dot. */
export function isKeyInVisibleWorkspacesList(storageKey, visibleWorkspaces) {
  if (!storageKey) return false;
  if (storageKey === 'workspace_home') return true;
  const list = Array.isArray(visibleWorkspaces) ? visibleWorkspaces : [];
  return list.some((w) => w.key === storageKey);
}

/**
 * After fullSync rebuilds the personal menu-visible list, shared tabs use `ws_visible_<uuid>`
 * keys that are intentionally absent from `visibleWorkspaces`. If we keep saving those as
 * `lastActiveStorageKey`, cold starts can reopen a shared tab when anything reads app state.
 */
export function normalizeLastActiveStorageKeyAfterSync({
  lastActiveStorageKey,
  nextVisibleWorkspaces,
  mergedWorkspaceIds,
  mergedStorageKeys,
}) {
  const lastActive =
    typeof lastActiveStorageKey === 'string' ? lastActiveStorageKey : 'workspace_home';
  const nextVisible = Array.isArray(nextVisibleWorkspaces) ? nextVisibleWorkspaces : [];
  const mergedIds =
    mergedWorkspaceIds instanceof Set ? mergedWorkspaceIds : new Set(mergedWorkspaceIds || []);
  const mergedKeys =
    mergedStorageKeys instanceof Set ? mergedStorageKeys : new Set(mergedStorageKeys || []);

  if (lastActive.startsWith(VISIBLE_WS_PREFIX)) {
    const wid = lastActive.slice(VISIBLE_WS_PREFIX.length);
    if (!mergedIds.has(wid)) return 'workspace_home';
    if (!isKeyInVisibleWorkspacesList(lastActive, nextVisible)) return 'workspace_home';
    return lastActive;
  }
  if (
    lastActive.startsWith(WORKSPACE_PREFIX) &&
    lastActive !== 'workspace_home' &&
    !mergedKeys.has(lastActive)
  ) {
    return 'workspace_home';
  }
  return lastActive;
}

/** Legacy dot/hidden workspaces use keys workspace_<slug> (not workspace_home, not ws_visible_*). */
export function isLegacyHiddenWorkspaceKey(storageKey) {
  return (
    typeof storageKey === 'string' &&
    storageKey.startsWith(WORKSPACE_PREFIX) &&
    storageKey !== 'workspace_home'
  );
}

/**
 * Sync binds hidden remote workspaces to workspace_<slug>_<12 hex from row id> (see syncEngine
 * fullSync + assignStorageKeyForRemoteWorkspace). Those are not user-created /manage entries
 * and duplicate the slug-only key for the same name.
 */
export function isAutoAssignedHiddenRemoteWorkspaceKey(key) {
  if (
    typeof key !== 'string' ||
    !key.startsWith(WORKSPACE_PREFIX) ||
    key === 'workspace_home'
  ) {
    return false;
  }
  const rest = key.slice(WORKSPACE_PREFIX.length);
  return /_([0-9a-f]{12})$/i.test(rest);
}

export function loadAppState() {
  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    if (!raw) {
      return {
        visibleWorkspaces: defaultVisibleWorkspaces(),
        lastActiveStorageKey: 'workspace_home',
      };
    }
    const parsed = JSON.parse(raw);
    return {
      visibleWorkspaces: normalizeVisibleWorkspacesList(
        parsed.visibleWorkspaces,
      ),
      lastActiveStorageKey:
        typeof parsed.lastActiveStorageKey === 'string'
          ? parsed.lastActiveStorageKey
          : 'workspace_home',
    };
  } catch {
    return {
      visibleWorkspaces: defaultVisibleWorkspaces(),
      lastActiveStorageKey: 'workspace_home',
    };
  }
}

export function saveAppState(visibleWorkspaces, lastActiveStorageKey) {
  localStorage.setItem(
    APP_STATE_KEY,
    JSON.stringify({ visibleWorkspaces, lastActiveStorageKey }),
  );
}

export function saveAppStatePartial(updates) {
  const prev = loadAppState();
  saveAppState(
    updates.visibleWorkspaces ?? prev.visibleWorkspaces,
    updates.lastActiveStorageKey ?? prev.lastActiveStorageKey,
  );
}

const WORKSPACE_ID_MAP_KEY = 'plainsight_workspace_id_map';
const WORKSPACE_ID_REVERSE_PREFIX = '__wsid__:'; // map[__wsid__:<uuid>] = <storageKey>

function readWorkspaceIdMap() {
  try {
    const raw = localStorage.getItem(WORKSPACE_ID_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeWorkspaceIdMap(map) {
  try {
    localStorage.setItem(WORKSPACE_ID_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(s) {
  return typeof s === 'string' && UUID_V4_RE.test(s);
}

function fallbackUuid() {
  // RFC4122 v4-ish fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateUuid() {
  return crypto?.randomUUID?.() ?? fallbackUuid();
}

/**
 * Resolve workspace storage key (e.g. workspace_home) from Supabase workspace UUID.
 */
export function getStorageKeyForWorkspaceId(workspaceId) {
  const map = readWorkspaceIdMap();
  const reverse = map[`${WORKSPACE_ID_REVERSE_PREFIX}${workspaceId}`];
  if (typeof reverse === 'string' && reverse) return reverse;
  for (const [storageKey, id] of Object.entries(map)) {
    if (storageKey.startsWith(WORKSPACE_ID_REVERSE_PREFIX)) continue;
    if (id === workspaceId) return storageKey;
  }
  return null; // not found
}

function migrateWorkspaceNotesForSync(data) {
  const notes = Array.isArray(data.notes) ? data.notes : [];
  let changed = false;
  const now = new Date().toISOString();
  const nextNotes = notes.map((n) => {
    if (!n || typeof n !== 'object') return n;
    const o = { ...n };
    if (!isUuid(o.id)) {
      o.id = generateUuid();
      changed = true;
    }
    if (!o.createdAt) {
      o.createdAt = now;
      changed = true;
    }
    if (!o.updatedAt) {
      o.updatedAt = o.createdAt;
      changed = true;
    }
    return o;
  });
  const next = { ...data, notes: nextNotes };
  return { next, changed };
}

/**
 * Stable mapping from local workspace storage key to a Supabase workspace UUID.
 * This allows local-only workspaces to get a proper UUID immediately.
 */
export function getWorkspaceIdForStorageKey(storageKey) {
  const map = readWorkspaceIdMap();
  const v = map[storageKey];
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Bind a storage key to a workspace UUID (overwrites prior key for this UUID).
 * Used for remote hydration and creating visible workspaces with stable ids.
 */
export function setWorkspaceIdMapping(storageKey, workspaceId) {
  const map = readWorkspaceIdMap();
  // Remove any old storageKey that pointed to this workspaceId.
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(WORKSPACE_ID_REVERSE_PREFIX)) continue;
    if (v === workspaceId && k !== storageKey) delete map[k];
  }
  // Remove any reverse entry that pointed to a different key.
  for (const [k, v] of Object.entries(map)) {
    if (!k.startsWith(WORKSPACE_ID_REVERSE_PREFIX)) continue;
    if (k === `${WORKSPACE_ID_REVERSE_PREFIX}${workspaceId}` && v !== storageKey) {
      delete map[k];
    }
  }
  map[storageKey] = workspaceId;
  map[`${WORKSPACE_ID_REVERSE_PREFIX}${workspaceId}`] = storageKey;
  writeWorkspaceIdMap(map);
}

/**
 * Drop storageKey ↔ workspace UUID entries after a workspace is removed (avoids stale sync bindings).
 */
export function removeWorkspaceIdMapping(storageKey, workspaceIdArg) {
  const map = readWorkspaceIdMap();
  const id =
    (typeof workspaceIdArg === 'string' && workspaceIdArg
      ? workspaceIdArg
      : null) || (storageKey ? map[storageKey] : null);
  if (!id && !storageKey) return;

  if (storageKey) delete map[storageKey];
  if (id) delete map[`${WORKSPACE_ID_REVERSE_PREFIX}${id}`];
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(WORKSPACE_ID_REVERSE_PREFIX)) continue;
    if (v === id) delete map[k];
  }
  writeWorkspaceIdMap(map);
}

export function getOrCreateWorkspaceIdForStorageKey(storageKey) {
  const map = readWorkspaceIdMap();
  // Visible workspace keys embed the UUID (critical for sync + shared ownership).
  if (typeof storageKey === 'string' && storageKey.startsWith(VISIBLE_WS_PREFIX)) {
    const embedded = storageKey.slice(VISIBLE_WS_PREFIX.length);
    if (isUuid(embedded)) {
      setWorkspaceIdMapping(storageKey, embedded);
      return embedded;
    }
  }

  const existing = map[storageKey];
  if (typeof existing === 'string' && existing) return existing;

  const id = generateUuid();
  setWorkspaceIdMapping(storageKey, id);
  return id;
}

/**
 * Deterministic storage key for a merged workspace row (remote or local).
 * usedKeys tracks keys already assigned in this bind pass.
 */
export function assignStorageKeyForRemoteWorkspace(w, usedKeys) {
  const kind = w.kind;
  const name = (w.name || '').trim();
  const take = (key) => {
    if (usedKeys.has(key)) return null;
    return key;
  };
  if (kind === 'visible' && name.toLowerCase() === 'home') {
    const k = take('workspace_home');
    if (k) return k;
  }
  if (kind === 'visible') {
    const k = take(`${VISIBLE_WS_PREFIX}${w.id}`);
    if (k) return k;
  }
  const slug =
    name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') ||
    'unnamed';
  let key = `${WORKSPACE_PREFIX}${slug}`;
  if (usedKeys.has(key)) {
    key = `${WORKSPACE_PREFIX}${slug}_${String(w.id || '')
      .replace(/-/g, '')
      .slice(0, 12)}`;
  }
  return key;
}

/**
 * When `getWorkspaceIdForStorageKey` is empty (orphan slug key vs canonical `workspace_<slug>_<12hex>`
 * after bind, or stale map), find the workspace row id by replaying the same key assignment as
 * `bindMergedWorkspacesToStorageKeys`.
 */
export function resolveWorkspaceIdForStorageKey(storageKey, workspaces) {
  if (
    typeof storageKey !== 'string' ||
    !storageKey.startsWith(WORKSPACE_PREFIX) ||
    storageKey === 'workspace_home' ||
    !Array.isArray(workspaces)
  ) {
    return undefined;
  }
  const mapped = getWorkspaceIdForStorageKey(storageKey);
  if (mapped) return mapped;

  const used = new Set();
  const sorted = [...workspaces].sort((a, b) => {
    const homeScore = (w) =>
      w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
        ? 0
        : 1;
    return homeScore(a) - homeScore(b);
  });
  for (const w of sorted) {
    if (!w?.id) continue;
    const assigned = assignStorageKeyForRemoteWorkspace(w, used);
    if (assigned === storageKey) return w.id;
    used.add(assigned);
  }
  return undefined;
}

/**
 * Rebuild storageKey ↔ workspace UUID mappings for all merged workspaces (e.g. after local wipe).
 * Replaces the entire map so deleted workspaces do not leave stale forwards/reverse entries.
 */
export function bindMergedWorkspacesToStorageKeys(workspaces) {
  if (!Array.isArray(workspaces)) return;
  const newMap = {};
  const used = new Set();
  const sorted = [...workspaces].sort((a, b) => {
    const homeScore = (w) =>
      w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
        ? 0
        : 1;
    return homeScore(a) - homeScore(b);
  });
  for (const w of sorted) {
    if (!w?.id) continue;
    const key = assignStorageKeyForRemoteWorkspace(w, used);
    newMap[key] = w.id;
    newMap[`${WORKSPACE_ID_REVERSE_PREFIX}${w.id}`] = key;
    used.add(key);
  }
  writeWorkspaceIdMap(newMap);
}

/** Keys assigned by {@link assignStorageKeyForRemoteWorkspace} for this merged list (in sort order). */
export function collectMergedWorkspaceStorageKeys(workspaces) {
  const used = new Set();
  const sorted = [...(workspaces || [])].sort((a, b) => {
    const homeScore = (w) =>
      w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
        ? 0
        : 1;
    return homeScore(a) - homeScore(b);
  });
  const keys = [];
  for (const w of sorted) {
    if (!w?.id) continue;
    const key = assignStorageKeyForRemoteWorkspace(w, used);
    keys.push(key);
    used.add(key);
  }
  return new Set(keys);
}

/**
 * Remove workspace_* localStorage blobs that no longer belong to the merged set (orphans from an
 * old hydration path that always used workspace_<slug>_<12hex> while bind uses workspace_<slug>).
 */
export function purgeOrphanWorkspaceBlobsFromLocalStorage(mergedWorkspaces, validKeysOverride) {
  const valid =
    validKeysOverride instanceof Set
      ? validKeysOverride
      : collectMergedWorkspaceStorageKeys(mergedWorkspaces);
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(WORKSPACE_PREFIX)) continue;
    if (!valid.has(k)) toRemove.push(k);
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Slug segment used for hidden workspace storage keys (matches assignStorageKeyForRemoteWorkspace). */
export function hiddenWorkspaceSlugFromName(name) {
  return (
    (name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '') || 'unnamed'
  );
}

/**
 * workspace_<slug> or workspace_<base>_<12hex> → lookup slug (base before disambiguation hex suffix).
 */
export function slugFromLegacyHiddenStorageKey(storageKey) {
  if (
    typeof storageKey !== 'string' ||
    storageKey === 'workspace_home' ||
    !storageKey.startsWith(WORKSPACE_PREFIX)
  ) {
    return null;
  }
  let rest = storageKey.slice(WORKSPACE_PREFIX.length);
  const suffixed = rest.match(/^(.+)_([0-9a-f]{12})$/i);
  if (suffixed) rest = suffixed[1];
  return rest || null;
}

/** When the id map is stale, resolve a hidden row by unique name slug match (manage-page keys). */
export function resolveHiddenWorkspaceIdBySlugFromList(storageKey, workspaces) {
  const slug = slugFromLegacyHiddenStorageKey(storageKey);
  if (!slug || !Array.isArray(workspaces)) return undefined;
  const hiddenMatches = workspaces.filter(
    (w) => w?.id && w.kind === 'hidden' && hiddenWorkspaceSlugFromName(w.name) === slug,
  );
  if (hiddenMatches.length !== 1) return undefined;
  return hiddenMatches[0].id;
}

/**
 * Build the WORKSPACES menu list (owned visible tabs + Home only).
 * Workspaces opened as a collaborator stay under “Shared Workspaces”; do not duplicate them here.
 */
export function rebuildVisibleWorkspacesFromRemote(workspaces, ownerId) {
  const visible = (workspaces || []).filter(
    (w) =>
      w.kind === 'visible' &&
      (ownerId ? String(w.owner_id || '') === String(ownerId) : true),
  );
  const entries = [{ id: 'home', name: 'Home', key: 'workspace_home' }];
  for (const w of visible) {
    if ((w.name || '').trim().toLowerCase() === 'home') continue;
    entries.push({
      id: w.id,
      name: w.name,
      key: `${VISIBLE_WS_PREFIX}${w.id}`,
    });
  }
  return normalizeVisibleWorkspacesList(entries);
}

export function getWorkspaceKey(name) {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '_');
  return slug === 'home' ? 'workspace_home' : `${WORKSPACE_PREFIX}${slug}`;
}

export function getWorkspaceNameFromKey(key) {
  if (key === 'workspace_home') return 'home';
  return key.startsWith(WORKSPACE_PREFIX) ? key.slice(WORKSPACE_PREFIX.length) : key;
}

export function getAllWorkspaceKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(WORKSPACE_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Every localStorage key that holds a workspace notes blob (home, visible tabs, hidden). */
export function enumerateWorkspaceBlobStorageKeys() {
  const seen = new Set();
  const out = [];
  const push = (k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k === 'workspace_home') {
      push(k);
      continue;
    }
    if (k.startsWith(VISIBLE_WS_PREFIX)) {
      push(k);
      continue;
    }
    if (isLegacyHiddenWorkspaceKey(k)) {
      push(k);
    }
  }
  return out;
}

/** Sync mirror of localDB `plainsight_local_workspaces` — source of truth for sync merge. */
const PLAINSIGHT_LOCAL_WORKSPACES_JSON_KEY = 'plainsight_local_workspaces';

function readMergedWorkspacesFromLocalStorageSync() {
  try {
    const raw = localStorage.getItem(PLAINSIGHT_LOCAL_WORKSPACES_JSON_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** True when a persisted workspace `name` is actually a storage key / technical id, not a user title. */
export function isCorruptWorkspaceMenuName(name) {
  const t = String(name || '').trim();
  if (!t) return true;
  if (/^ws_visible_[0-9a-f-]{36}$/i.test(t)) return true;
  return false;
}

/**
 * Sync read of merged `workspaces` row name (localStorage mirror used by cloud sync).
 * Stable when visible tab list or share rows are briefly empty during refresh.
 */
export function getMergedWorkspaceNameByIdSync(workspaceId) {
  const id = String(workspaceId || '').trim();
  if (!id || !isUuid(id)) return '';
  const rows = readMergedWorkspacesFromLocalStorageSync();
  const row = rows.find((w) => w && String(w.id) === id);
  const nm = row && typeof row.name === 'string' ? row.name.trim() : '';
  if (isCorruptWorkspaceMenuName(nm)) return '';
  return nm || '';
}

/**
 * Human-readable label for a workspace storage key.
 * Menu-visible keys `ws_visible_<uuid>` are never returned raw — we resolve the merged row name.
 */
export function getWorkspaceDisplayLabelFromStorageKey(key) {
  if (!key || typeof key !== 'string') return 'Workspace';
  if (key === 'workspace_home') return 'Home';
  if (key.startsWith(VISIBLE_WS_PREFIX)) {
    const id = key.slice(VISIBLE_WS_PREFIX.length);
    const nm = getMergedWorkspaceNameByIdSync(id);
    return nm || 'Workspace';
  }
  if (key.startsWith(WORKSPACE_PREFIX)) return key.slice(WORKSPACE_PREFIX.length);
  return key;
}

/**
 * Hidden workspaces for /manage: merged `kind: 'hidden'` rows (same key assignment as bind),
 * plus any legacy `workspace_<slug>` blobs that were never mirrored into the merged list
 * (e.g. local-only before ensureWorkspaceRow wrote rows).
 */
export function getHiddenWorkspaceManageEntries() {
  const workspaces = readMergedWorkspacesFromLocalStorageSync();
  const uid = String(getLocalSession().userId || '').trim();
  const used = new Set();
  const sorted = [...workspaces].sort((a, b) => {
    const homeScore = (w) =>
      w.kind === 'visible' && (w.name || '').trim().toLowerCase() === 'home'
        ? 0
        : 1;
    return homeScore(a) - homeScore(b);
  });
  const out = [];
  for (const w of sorted) {
    if (!w?.id || w.kind !== 'hidden') continue;
    // Hidden Workspaces (/manage) is a "my private spaces" list.
    // Never list collaborator/shared workspaces here, even if a buggy client persisted them
    // as kind=hidden under another owner's id.
    if (uid && String(w.owner_id || '') !== uid) continue;
    const storageKey = assignStorageKeyForRemoteWorkspace(w, used);
    used.add(storageKey);
    if (!storageKey.startsWith(WORKSPACE_PREFIX) || storageKey === 'workspace_home') continue;
    const displayName =
      (typeof w.name === 'string' && w.name.trim()) ||
      getWorkspaceNameFromKey(storageKey);
    out.push({ storageKey, id: w.id, displayName });
  }

  const listed = new Set(out.map((e) => e.storageKey));
  for (const storageKey of getAllWorkspaceKeys()) {
    if (storageKey === 'workspace_home') continue;
    if (!isLegacyHiddenWorkspaceKey(storageKey)) continue;
    // Never list legacy hidden keys for accepted shared-workspace slugs.
    // (They can be created by buggy clients or old builds; treat as invalid in /manage.)
    if (isBlockedLegacyHiddenWorkspaceKey(storageKey)) continue;
    if (listed.has(storageKey)) continue;
    const id = getOrCreateWorkspaceIdForStorageKey(storageKey);
    const fromMerged = workspaces.find((w) => w.id === id && w.kind === 'hidden');
    const displayName =
      (typeof fromMerged?.name === 'string' && fromMerged.name.trim()) ||
      getWorkspaceNameFromKey(storageKey);
    out.push({ storageKey, id, displayName });
    listed.add(storageKey);
  }

  return out;
}

/** Dot-command / legacy hidden keys: merged rows + orphan `workspace_*` blobs (see getHiddenWorkspaceManageEntries). */
export function countHiddenWorkspaceKeys() {
  return getHiddenWorkspaceManageEntries().length;
}

function normalizeArchivedNotes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    const text = typeof v.text === 'string' ? v.text : k;
    const lastDeletedAt =
      typeof v.lastDeletedAt === 'number' && Number.isFinite(v.lastDeletedAt)
        ? v.lastDeletedAt
        : Date.now();
    const category =
      v.category === undefined || v.category === null || v.category === ''
        ? undefined
        : String(v.category);
    out[text] = { text, category, lastDeletedAt };
  }
  return out;
}

export function loadWorkspace(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultWorkspaceData();
    const data = JSON.parse(raw);
    const base = {
      categories: Array.isArray(data.categories) ? data.categories : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      archivedNotes: normalizeArchivedNotes(data.archivedNotes),
    };
    const { next, changed } = migrateWorkspaceNotesForSync(base);
    let out = next;
    let needsSave = changed;
    const pruned = pruneArchivedNotesUi(
      out.archivedNotes,
      MAX_ARCHIVED_ITEMS_PER_WORKSPACE,
    );
    if (pruned.removedTextKeys.length > 0) {
      out = { ...out, archivedNotes: pruned.map };
      needsSave = true;
      const wid = getOrCreateWorkspaceIdForStorageKey(key);
      const deletedAt = new Date().toISOString();
      void (async () => {
        try {
          const existing = await getLocalArchivedNoteTombstones(wid);
          const newTombs = pruned.removedTextKeys.map((text) => ({
            id: archivedRowIdForText(wid, text),
            workspace_id: wid,
            deleted_at: deletedAt,
          }));
          const idSet = new Set(newTombs.map((t) => t.id));
          await saveLocalArchivedNoteTombstones(wid, [
            ...newTombs,
            ...existing.filter((t) => !idSet.has(t.id)),
          ]);
        } catch {
          /* ignore */
        }
      })();
    }
    if (needsSave) saveWorkspace(key, out);
    return out;
  } catch {
    return getDefaultWorkspaceData();
  }
}

export function saveWorkspace(key, data) {
  // Never write legacy hidden blobs for shared-workspace slugs.
  // Those should live under ws_visible_<id>, and writing here causes /manage to list them as hidden.
  try {
    if (isBlockedLegacyHiddenWorkspaceKey(key)) return;
  } catch {
    /* ignore */
  }
  localStorage.setItem(key, JSON.stringify(data));
}

export function deleteWorkspace(key) {
  localStorage.removeItem(key);
}

export function getDefaultWorkspaceData() {
  return { categories: [], notes: [], archivedNotes: {} };
}

export function getMasterKey() {
  return localStorage.getItem(MASTER_KEY);
}

export function setMasterKey(value) {
  if (value) localStorage.setItem(MASTER_KEY, value);
  else localStorage.removeItem(MASTER_KEY);
}

export function clearMasterKey() {
  localStorage.removeItem(MASTER_KEY);
}

/** Last known workspace IDs shown under Shared (owner shares); avoids menu flicker before shares load. */
const OWNER_SHARED_WORKSPACE_IDS_CACHE_KEY = 'plainsight_owner_shared_ws_ids_v1';

/**
 * @returns {Set<string>}
 */
export function getOwnerSharedWorkspaceIdsCache() {
  try {
    const raw = localStorage.getItem(OWNER_SHARED_WORKSPACE_IDS_CACHE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

/**
 * @param {Set<string> | Iterable<string>} ids
 */
export function setOwnerSharedWorkspaceIdsCache(ids) {
  try {
    const list = ids instanceof Set ? [...ids] : [...ids];
    if (!list.length) {
      localStorage.removeItem(OWNER_SHARED_WORKSPACE_IDS_CACHE_KEY);
      return;
    }
    localStorage.setItem(OWNER_SHARED_WORKSPACE_IDS_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Accepted + pending shared workspace menu rows, keyed by Plainsight user id (OTP session). */
const SHARED_WS_MENU_CACHE_PREFIX = 'plainsight_shared_ws_menu_v1_';

/**
 * @param {string} userId
 * @returns {{ acceptedRows: unknown[]; pendingRows: unknown[] } | null}
 */
export function readSharedWorkspaceMenuCache(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(SHARED_WS_MENU_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    const acceptedRows = Array.isArray(parsed.acceptedRows) ? parsed.acceptedRows : [];
    const pendingRows = Array.isArray(parsed.pendingRows) ? parsed.pendingRows : [];
    return { acceptedRows, pendingRows };
  } catch {
    return null;
  }
}

/**
 * @param {string} userId
 * @param {{ acceptedRows?: unknown[]; pendingRows?: unknown[] }} payload
 */
export function writeSharedWorkspaceMenuCache(userId, payload) {
  if (!userId) return;
  try {
    const acceptedRows = Array.isArray(payload?.acceptedRows) ? payload.acceptedRows : [];
    const pendingRows = Array.isArray(payload?.pendingRows) ? payload.pendingRows : [];
    localStorage.setItem(
      SHARED_WS_MENU_CACHE_PREFIX + userId,
      JSON.stringify({ v: 1, acceptedRows, pendingRows }),
    );
  } catch {
    /* ignore */
  }
}

/** @param {string | null | undefined} userId */
export function clearSharedWorkspaceMenuCache(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(SHARED_WS_MENU_CACHE_PREFIX + userId);
  } catch {
    /* ignore */
  }
}
