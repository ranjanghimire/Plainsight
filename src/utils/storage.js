const WORKSPACE_PREFIX = 'workspace_';
const MASTER_KEY = 'masterKey';

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

export function loadWorkspace(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return getDefaultWorkspaceData();
    const data = JSON.parse(raw);
    return {
      categories: Array.isArray(data.categories) ? data.categories : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
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
  return { categories: [], notes: [] };
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
