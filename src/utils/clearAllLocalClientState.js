import { clearSession, ensureLocalSession } from '../auth/localSession';

export const CLIENT_LOGOUT_BROADCAST_CHANNEL = 'plainsight-client-logout';

const PRESERVED_LOCAL_KEYS = new Set(['plainsight-theme']);

/**
 * Keys that hold Plainsight workspace / sync / auth client state (not theme).
 * @returns {string[]}
 */
export function collectRemovableLocalStorageKeys() {
  if (typeof localStorage === 'undefined') return [];
  const out = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || PRESERVED_LOCAL_KEYS.has(k)) continue;
    if (
      k.startsWith('plainsight_') ||
      k.startsWith('workspace_') ||
      k.startsWith('ws_visible_') ||
      k === 'masterKey'
    ) {
      out.push(k);
    }
  }
  return out;
}

function clearMatchingSessionStorageKeys() {
  if (typeof sessionStorage === 'undefined') return;
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith('plainsight_')) keys.push(k);
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

async function clearServiceWorkerCaches() {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.includes('plainsight') || k.includes('Plainsight')).map((k) => caches.delete(k)),
    );
  } catch {
    /* ignore */
  }
}

function broadcastLogoutToOtherTabs(reason) {
  try {
    const bc = new BroadcastChannel(CLIENT_LOGOUT_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'CLEAR', reason, t: Date.now() });
    bc.close();
  } catch {
    /* ignore */
  }
}

/**
 * Wipes Plainsight client persistence (localStorage + sessionStorage plainsight_* + SW caches).
 * Preserves theme (`plainsight-theme`). Restores Phase-1 local dev session placeholder.
 * @param {'logout' | 'signin_clear' | 'user_request'} reason
 * @param {{ broadcast?: boolean }} [options] when false, does not trigger cross-tab reload
 */
export async function clearAllLocalClientState(reason, options) {
  const keys = collectRemovableLocalStorageKeys();
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  clearMatchingSessionStorageKeys();
  clearSession();
  ensureLocalSession();
  await clearServiceWorkerCaches();
  if (options?.broadcast !== false) {
    broadcastLogoutToOtherTabs(reason);
  }
}
