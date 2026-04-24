import { enumerateWorkspaceBlobStorageKeys, loadWorkspace } from './storage';

/**
 * True when any workspace blob has notes, categories, or archived entries.
 * Used to gate "sign in to existing account" without merge (must clear device first).
 */
export function localWorkspaceHasMeaningfulData() {
  try {
    for (const key of enumerateWorkspaceBlobStorageKeys()) {
      const ws = loadWorkspace(key);
      if (!ws || typeof ws !== 'object') continue;
      if (Array.isArray(ws.notes) && ws.notes.length > 0) return true;
      if (Array.isArray(ws.categories) && ws.categories.length > 0) return true;
      if (ws.archivedNotes && typeof ws.archivedNotes === 'object') {
        if (Object.keys(ws.archivedNotes).length > 0) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}
