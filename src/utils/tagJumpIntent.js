const STORAGE_KEY = 'plainsight:tag-jump-intent';

/**
 * Persist one-shot navigation from Tags → notes (sessionStorage survives SPA route change).
 * @param {{ storageKey: string; noteId: string }} payload
 */
export function writeTagJumpIntent({ storageKey, noteId }) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        storageKey: String(storageKey || ''),
        noteId: String(noteId || ''),
        at: Date.now(),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** @returns {{ storageKey: string; noteId: string } | null} */
export function peekTagJumpIntent() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.storageKey !== 'string' || typeof o.noteId !== 'string') return null;
    if (!o.storageKey || !o.noteId) return null;
    return { storageKey: o.storageKey, noteId: o.noteId };
  } catch {
    return null;
  }
}

export function clearTagJumpIntent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
