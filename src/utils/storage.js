const WORKSPACE_PREFIX = 'workspace_';
const MASTER_KEY = 'masterKey';

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
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      archivedNotes: normalizeArchivedNotes(data.archivedNotes),
    };
  } catch {
    return getDefaultWorkspaceData();
  }
}

export function saveWorkspace(key, data) {
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
