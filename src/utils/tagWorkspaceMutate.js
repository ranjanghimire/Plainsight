import {
  loadWorkspace,
  saveWorkspace,
  enumerateWorkspaceBlobStorageKeys,
  getOrCreateWorkspaceIdForStorageKey,
} from './storage';
import {
  normalizeTagSlug,
  removeTagFromNoteText,
  renameTagInNoteText,
} from './noteTags';
import { archivedRowIdForText } from './archivedIds';
import {
  getLocalArchivedNoteTombstones,
  saveLocalArchivedNoteTombstones,
} from '../sync/localDB';

async function appendArchivedTombstones(workspaceId, oldIds, deletedAt) {
  const ids = [...new Set(oldIds)].filter(Boolean);
  if (ids.length === 0) return;
  const existing = await getLocalArchivedNoteTombstones(workspaceId);
  const idSet = new Set(ids);
  const rows = ids.map((id) => ({
    id,
    workspace_id: workspaceId,
    deleted_at: deletedAt,
  }));
  await saveLocalArchivedNoteTombstones(workspaceId, [
    ...rows,
    ...existing.filter((t) => !idSet.has(t.id)),
  ]);
}

/**
 * @param {string} storageKey
 * @param {Record<string, unknown>} archivedNotes
 * @param {(fullText: string) => string} mapFullText
 */
function mutateArchivedMap(storageKey, archivedNotes, mapFullText) {
  const wid = getOrCreateWorkspaceIdForStorageKey(storageKey);
  const nextArch = {};
  let changed = false;
  const tombIds = [];

  for (const [k, entry] of Object.entries(archivedNotes || {})) {
    const fullText = typeof entry?.text === 'string' ? entry.text : k;
    const nt = mapFullText(fullText);
    if (nt !== fullText) {
      changed = true;
      tombIds.push(archivedRowIdForText(wid, fullText));
    }
    const lastDeletedAt =
      typeof entry?.lastDeletedAt === 'number' && Number.isFinite(entry.lastDeletedAt)
        ? entry.lastDeletedAt
        : Date.now();
    const el = {
      text: nt,
      category: entry?.category,
      lastDeletedAt,
    };
    if (nextArch[nt]) {
      const prev = nextArch[nt];
      if ((el.lastDeletedAt || 0) >= (prev.lastDeletedAt || 0)) nextArch[nt] = el;
    } else {
      nextArch[nt] = el;
    }
  }

  return { nextArch, changed, tombIds };
}

/**
 * Remove a tag from every note and archived entry across all workspace blobs.
 * @returns {Promise<{ changedCount: number }>}
 */
export async function applyTagRemovalAcrossAllWorkspaces(tagSlug) {
  const normalized = normalizeTagSlug(tagSlug);
  if (!normalized) return { changedCount: 0 };

  const keys = enumerateWorkspaceBlobStorageKeys();
  let changedCount = 0;
  const deletedAt = new Date().toISOString();

  for (const storageKey of keys) {
    const data = loadWorkspace(storageKey);
    let changed = false;
    const wid = getOrCreateWorkspaceIdForStorageKey(storageKey);

    const notes = (data.notes || []).map((n) => {
      const nt = removeTagFromNoteText(n.text, normalized);
      if (nt !== n.text) {
        changed = true;
        return { ...n, text: nt };
      }
      return n;
    });

    const { nextArch, changed: archChanged, tombIds } = mutateArchivedMap(
      storageKey,
      data.archivedNotes,
      (fullText) => removeTagFromNoteText(fullText, normalized),
    );
    if (archChanged) changed = true;

    if (changed) {
      saveWorkspace(storageKey, {
        ...data,
        notes,
        archivedNotes: nextArch,
      });
      changedCount += 1;
      await appendArchivedTombstones(wid, tombIds, deletedAt);
    }
  }

  return { changedCount };
}

/**
 * Rename a tag everywhere (normalized slugs).
 * @returns {Promise<{ changedCount: number }>}
 */
export async function applyTagRenameAcrossAllWorkspaces(oldSlug, newRaw) {
  const oldN = normalizeTagSlug(oldSlug);
  const newN = normalizeTagSlug(newRaw);
  if (!oldN || !newN || oldN === newN) return { changedCount: 0 };

  const keys = enumerateWorkspaceBlobStorageKeys();
  let changedCount = 0;
  const deletedAt = new Date().toISOString();

  for (const storageKey of keys) {
    const data = loadWorkspace(storageKey);
    let changed = false;
    const wid = getOrCreateWorkspaceIdForStorageKey(storageKey);

    const notes = (data.notes || []).map((n) => {
      const nt = renameTagInNoteText(n.text, oldN, newN);
      if (nt !== n.text) {
        changed = true;
        return { ...n, text: nt };
      }
      return n;
    });

    const { nextArch, changed: archChanged, tombIds } = mutateArchivedMap(
      storageKey,
      data.archivedNotes,
      (fullText) => renameTagInNoteText(fullText, oldN, newN),
    );
    if (archChanged) changed = true;

    if (changed) {
      saveWorkspace(storageKey, {
        ...data,
        notes,
        archivedNotes: nextArch,
      });
      changedCount += 1;
      await appendArchivedTombstones(wid, tombIds, deletedAt);
    }
  }

  return { changedCount };
}
