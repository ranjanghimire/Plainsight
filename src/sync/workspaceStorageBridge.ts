import { v4 as uuidv4 } from 'uuid';
import type { ArchivedNote, Category, Note } from './types';
import {
  getLocalArchivedNoteTombstones,
  getLocalArchivedNotes,
  getLocalCategoryTombstones,
  getLocalCategories,
  getLocalNotes,
  getLocalNoteTombstones,
  saveLocalArchivedNoteTags,
  saveLocalArchivedNotes,
  saveLocalArchivedNoteTombstones,
  saveLocalCategories,
  saveLocalNoteTags,
  saveLocalNotes,
} from './localDB';
import { archivedNoteTagRowsFromArchived, noteTagRowsFromNotes } from './tagSync';
import { pruneArchivedNoteRows } from '../utils/archivedPrune';
import {
  loadWorkspace,
  saveWorkspace,
  getStorageKeyForWorkspaceId,
  isUuid,
} from '../utils/storage';
import { archivedRowIdForText } from '../utils/archivedIds';
export { archivedRowIdForText };

function mergeNotesById(a: Note[], b: Note[]): Note[] {
  const map = new Map<string, Note>();
  for (const n of a) map.set(n.id, n);
  for (const n of b) {
    const o = map.get(n.id);
    if (!o) {
      map.set(n.id, n);
      continue;
    }
    const ot = Date.parse(o.updated_at);
    const nt = Date.parse(n.updated_at);
    const oOk = Number.isFinite(ot);
    const nOk = Number.isFinite(nt);
    const winner = !oOk ? n : !nOk ? o : nt >= ot ? n : o;
    map.set(n.id, winner);
  }
  return [...map.values()];
}

/** Active note ids come from the UI blob; local DB rows for removed ids must not survive flush. */
function mergeLocalNotesWithUiNotes(localNotes: Note[], uiNoteRows: Note[]): Note[] {
  const localById = new Map(localNotes.map((n) => [n.id, n]));
  return uiNoteRows.map((ui) => {
    const ln = localById.get(ui.id);
    if (!ln) return ui;
    const ot = Date.parse(ln.updated_at);
    const nt = Date.parse(ui.updated_at);
    const oOk = Number.isFinite(ot);
    const nOk = Number.isFinite(nt);
    return !nOk ? ln : !oOk ? ui : nt >= ot ? ui : ln;
  });
}

/**
 * UI localStorage is authoritative for which archived rows exist (same pattern as
 * `mergeLocalNotesWithUiNotes`). Rows present only in `localArch` are treated as
 * removed in the UI (e.g. restore) and must not survive flush or they reappear after sync.
 */
export function mergeLocalArchivedWithUiArchived(
  localArch: ArchivedNote[],
  uiArch: ArchivedNote[],
): ArchivedNote[] {
  const localById = new Map(localArch.map((n) => [n.id, n]));
  return uiArch.map((ui) => {
    const ln = localById.get(ui.id);
    if (!ln) return ui;
    const ot = Date.parse(ln.last_deleted_at);
    const nt = Date.parse(ui.last_deleted_at);
    const oOk = Number.isFinite(ot);
    const nOk = Number.isFinite(nt);
    return !nOk ? ln : !oOk ? ui : nt >= ot ? ui : ln;
  });
}

export type FlushWorkspaceUiOpts = {
  /**
   * Note ids we have previously confirmed on the server (see fullSync + local cache).
   * With `remoteNoteIdsThisPull`, UI rows for ids that are confirmed but missing from the
   * current pull are stripped so a stale localStorage blob cannot re-seed rows another client deleted.
   */
  remoteIdsEverConfirmed?: Set<string> | null;
  /** Active note ids from the current server pull for this workspace. */
  remoteNoteIdsThisPull?: Set<string> | null;
  /** Same pattern as notes, for archived_notes (shared workspace clear-all / peer deletes). */
  remoteArchivedIdsEverConfirmed?: Set<string> | null;
  /** Archived note ids returned by the current server pull for this workspace. */
  remoteArchivedIdsThisPull?: Set<string> | null;
};

/**
 * Merge UI workspace JSON (localStorage workspace_* keys) into plainsight_local_*
 * rows so fullSync can merge with remote. Uses workspace UUID from the id map.
 */
export async function flushWorkspaceUiIntoLocalDb(
  workspaceId: string,
  opts?: FlushWorkspaceUiOpts | null,
): Promise<void> {
  const storageKey = getStorageKeyForWorkspaceId(workspaceId);
  if (!storageKey) return;

  const ui = loadWorkspace(storageKey);
  const now = new Date().toISOString();
  const confirmed = opts?.remoteIdsEverConfirmed;
  const pullIds = opts?.remoteNoteIdsThisPull;

  const existingCats = await getLocalCategories(workspaceId);
  /** One row per name (avoids duplicate-name rows if local DB was ever inconsistent). */
  const byName = new Map<string, Category>();
  for (const c of existingCats) {
    const prev = byName.get(c.name);
    if (!prev) {
      byName.set(c.name, c);
      continue;
    }
    const ct = Date.parse(c.updated_at);
    const pt = Date.parse(prev.updated_at);
    const cOk = Number.isFinite(ct);
    const pOk = Number.isFinite(pt);
    if ((cOk && pOk && ct >= pt) || (cOk && !pOk)) byName.set(c.name, c);
  }
  const categories: Category[] = Array.from(byName.values());
  function ensureCategoryForName(name: string | null): string | null {
    if (name === null || name === '') return null;
    const n = name.trim();
    if (!n) return null;
    let row = byName.get(n);
    if (!row) {
      row = {
        id: uuidv4(),
        workspace_id: workspaceId,
        name: n,
        created_at: now,
        updated_at: now,
      };
      categories.push(row);
      byName.set(n, row);
    }
    return row.id;
  }

  const referencedNames = new Set<string>();
  for (const name of ui.categories || []) {
    if (typeof name === 'string' && name.trim()) referencedNames.add(name.trim());
  }
  for (const n of ui.notes || []) {
    const c = (n as { category?: unknown }).category;
    if (c !== undefined && c !== null && c !== '' && typeof c === 'string' && c.trim()) {
      referencedNames.add(c.trim());
    }
  }
  for (const entry of Object.values(ui.archivedNotes || {})) {
    const c = entry?.category;
    if (c !== undefined && c !== null && c !== '' && typeof c === 'string' && c.trim()) {
      referencedNames.add(c.trim());
    }
  }
  for (const name of referencedNames) ensureCategoryForName(name);
  // Drop categories no longer referenced by the UI blob (prevents orphan rows + duplicate
  // workspace_id/name on push after the user deletes a chip).
  const categoriesSaved = [...referencedNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => byName.get(name))
    .filter((c): c is Category => Boolean(c));
  await saveLocalCategories(workspaceId, categoriesSaved);

  const localNotes = await getLocalNotes(workspaceId);
  const rawUiNotes = Array.isArray(ui.notes) ? ui.notes : [];
  const noteTombsForFlush = await getLocalNoteTombstones(workspaceId);
  const tombNoteIdsForFlush = new Set(noteTombsForFlush.map((t) => t.id));
  const uiNotesAfterConfirmedStrip =
    confirmed && pullIds && confirmed.size > 0
      ? rawUiNotes.filter((n) => {
          const id =
            typeof (n as { id?: unknown }).id === 'string' ? String((n as { id: string }).id).trim() : '';
          if (!id) return true;
          if (confirmed.has(id) && !pullIds.has(id)) return false;
          return true;
        })
      : rawUiNotes;
  /** Never re-seed rows the user already tombstoned (avoids races before layout saves UI JSON). */
  const uiNotesForMerge = uiNotesAfterConfirmedStrip.filter((n) => {
    const id =
      typeof (n as { id?: unknown }).id === 'string' ? String((n as { id: string }).id).trim() : '';
    if (!id) return true;
    return !tombNoteIdsForFlush.has(id);
  });
  const uiNoteRows: Note[] = uiNotesForMerge.map((n: Record<string, unknown>) => {
    const text = typeof n.text === 'string' ? n.text : '';
    const cat =
      n.category === undefined || n.category === null || n.category === ''
        ? null
        : String(n.category);
    const categoryId = cat ? ensureCategoryForName(cat) : null;
    let id = typeof n.id === 'string' && isUuid(n.id) ? n.id : uuidv4();
    const createdRaw =
      (typeof n.createdAt === 'string' && n.createdAt) ||
      (typeof n.created_at === 'string' && n.created_at) ||
      now;
    const updatedRaw =
      (typeof n.updatedAt === 'string' && n.updatedAt) ||
      (typeof n.updated_at === 'string' && n.updated_at) ||
      createdRaw;
    const base: Note = {
      id,
      workspace_id: workspaceId,
      text,
      category_id: categoryId,
      created_at: createdRaw,
      updated_at: updatedRaw,
    };
    const boldRaw = (n as { boldFirstLine?: unknown }).boldFirstLine;
    return boldRaw === true ? { ...base, bold_first_line: true } : base;
  });
  const mergedActiveNotes = mergeLocalNotesWithUiNotes(localNotes, uiNoteRows);
  await saveLocalNotes(workspaceId, mergedActiveNotes);
  await saveLocalNoteTags(workspaceId, noteTagRowsFromNotes(mergedActiveNotes));

  const localArch = await getLocalArchivedNotes(workspaceId);
  const aConfirmed = opts?.remoteArchivedIdsEverConfirmed;
  const aPull = opts?.remoteArchivedIdsThisPull;

  let archivedEntries = Object.values(ui.archivedNotes || {}) as {
    text?: string;
    category?: string;
    lastDeletedAt?: number;
  }[];
  // Strip UI rows the server no longer lists (including empty pull), but never drop
  // archived text that has never been confirmed on the server — e.g. delete-to-archive
  // before the first push (aPull can be empty while the new id is not in aConfirmed).
  if (aConfirmed != null && aPull != null && aConfirmed.size > 0) {
    archivedEntries = archivedEntries.filter((entry) => {
      const text = typeof entry.text === 'string' ? entry.text : '';
      const id = archivedRowIdForText(workspaceId, text);
      if (!text.trim()) return true;
      if (aConfirmed.has(id) && !aPull.has(id)) return false;
      return true;
    });
  }

  const uiArch: ArchivedNote[] = archivedEntries.map(
    (entry: { text?: string; category?: string; lastDeletedAt?: number }) => {
      const text = typeof entry.text === 'string' ? entry.text : '';
      const cat =
        entry.category === undefined || entry.category === null || entry.category === ''
          ? null
          : String(entry.category);
      const categoryId = cat ? ensureCategoryForName(cat) : null;
      const t =
        typeof entry.lastDeletedAt === 'number' && Number.isFinite(entry.lastDeletedAt)
          ? entry.lastDeletedAt
          : Date.now();
      const iso = new Date(t).toISOString();
      return {
        id: archivedRowIdForText(workspaceId, text),
        workspace_id: workspaceId,
        text,
        category_id: categoryId,
        last_deleted_at: iso,
        created_at: iso,
      };
    },
  );
  const mergedArch = mergeLocalArchivedWithUiArchived(localArch, uiArch);
  const uiArchIdSet = new Set(uiArch.map((r) => r.id));
  const droppedLocal = localArch.filter((r) => !uiArchIdSet.has(r.id));

  const { kept: archKept, removed: archRemoved } = pruneArchivedNoteRows(mergedArch);
  await saveLocalArchivedNotes(workspaceId, archKept);
  await saveLocalArchivedNoteTags(workspaceId, archivedNoteTagRowsFromArchived(archKept));

  const tombCandidates = [...archRemoved, ...droppedLocal];
  if (tombCandidates.length > 0) {
    const deletedAt = new Date().toISOString();
    const byTombId = new Map<string, ArchivedNote>();
    for (const r of tombCandidates) {
      if (r?.id) byTombId.set(r.id, r);
    }
    const removedIds = new Set(byTombId.keys());
    const existingTombs = await getLocalArchivedNoteTombstones(workspaceId);
    const newTombs = [...removedIds].map((id) => ({
      id,
      workspace_id: workspaceId,
      deleted_at: deletedAt,
    }));
    await saveLocalArchivedNoteTombstones(workspaceId, [
      ...newTombs,
      ...existingTombs.filter((t) => !removedIds.has(t.id)),
    ]);
  }
}

/** Push helper: drop category_id values that do not exist in the merged category set. */
export function alignNoteCategoryIds(notes: Note[], categories: Category[]): Note[] {
  const valid = new Set(categories.map((c) => c.id));
  return notes.map((n) => {
    if (!n.category_id) return n;
    if (valid.has(n.category_id)) return n;
    console.warn('alignNoteCategoryIds: clearing stale category_id', n.id, n.category_id);
    return { ...n, category_id: null };
  });
}

export function alignArchivedNoteCategoryIds(
  rows: ArchivedNote[],
  categories: Category[],
): ArchivedNote[] {
  const valid = new Set(categories.map((c) => c.id));
  return rows.map((n) => {
    if (!n.category_id) return n;
    if (valid.has(n.category_id)) return n;
    return { ...n, category_id: null };
  });
}

export function ensureWorkspaceUiBlob(storageKey: string): void {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return;
    saveWorkspace(storageKey, { categories: [], notes: [], archivedNotes: {} });
  } catch {
    // ignore
  }
}

/**
 * Write hydrated Supabase-shaped rows from local DB into the UI workspace blob.
 */
export async function hydrateWorkspaceUiFromLocalDb(workspaceId: string): Promise<void> {
  const storageKey = getStorageKeyForWorkspaceId(workspaceId);
  if (!storageKey) return;

  ensureWorkspaceUiBlob(storageKey);

  const cats = await getLocalCategories(workspaceId);
  const notes = await getLocalNotes(workspaceId);
  const archived = await getLocalArchivedNotes(workspaceId);
  const noteTombs = await getLocalNoteTombstones(workspaceId);
  const categoryTombs = await getLocalCategoryTombstones(workspaceId);

  const tombNoteIds = new Set(noteTombs.map((t) => t.id));
  const tombCategoryIds = new Set(categoryTombs.map((t) => t.id));

  const liveCats = cats.filter((c) => !tombCategoryIds.has(c.id));
  const liveNotes = notes.filter((n) => !tombNoteIds.has(n.id));

  const idToName = new Map(liveCats.map((c) => [c.id, c.name]));
  const categoryNames = [...liveCats]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.name);

  const uiNotes = liveNotes.map((n) => ({
    id: n.id,
    text: n.text,
    category: n.category_id ? (idToName.get(n.category_id) ?? null) : null,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    ...(n.bold_first_line === true ? { boldFirstLine: true } : {}),
  }));

  const archivedNotes: Record<
    string,
    { text: string; category?: string; lastDeletedAt: number }
  > = {};
  for (const a of archived) {
    const t = Date.parse(a.last_deleted_at);
    archivedNotes[a.text] = {
      text: a.text,
      category: a.category_id ? idToName.get(a.category_id) ?? undefined : undefined,
      lastDeletedAt: Number.isFinite(t) ? t : Date.now(),
    };
  }

  saveWorkspace(storageKey, {
    categories: categoryNames,
    notes: uiNotes,
    archivedNotes,
  });
}
