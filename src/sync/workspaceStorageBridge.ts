import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import type { ArchivedNote, Category, Note } from './types';
import {
  getLocalArchivedNotes,
  getLocalCategories,
  getLocalNotes,
  saveLocalArchivedNotes,
  saveLocalCategories,
  saveLocalNotes,
} from './localDB';
import {
  loadWorkspace,
  saveWorkspace,
  getStorageKeyForWorkspaceId,
  isUuid,
} from '../utils/storage';

/** Fixed namespace for deterministic archived row ids (v5). */
const ARCHIVE_ID_NAMESPACE = '018d0e28-8f3a-7000-8000-000000000001';

export function archivedRowIdForText(workspaceId: string, text: string): string {
  return uuidv5(`${workspaceId}\0${text}`, ARCHIVE_ID_NAMESPACE);
}

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

function mergeArchivedById(a: ArchivedNote[], b: ArchivedNote[]): ArchivedNote[] {
  const map = new Map<string, ArchivedNote>();
  for (const n of a) map.set(n.id, n);
  for (const n of b) {
    const o = map.get(n.id);
    if (!o) {
      map.set(n.id, n);
      continue;
    }
    const ot = Date.parse(o.last_deleted_at);
    const nt = Date.parse(n.last_deleted_at);
    const oOk = Number.isFinite(ot);
    const nOk = Number.isFinite(nt);
    const winner = !oOk ? n : !nOk ? o : nt >= ot ? n : o;
    map.set(n.id, winner);
  }
  return [...map.values()];
}

/**
 * Merge UI workspace JSON (localStorage workspace_* keys) into plainsight_local_*
 * rows so fullSync can merge with remote. Uses workspace UUID from the id map.
 */
export async function flushWorkspaceUiIntoLocalDb(workspaceId: string): Promise<void> {
  const storageKey = getStorageKeyForWorkspaceId(workspaceId);
  if (!storageKey) return;

  const ui = loadWorkspace(storageKey);
  const now = new Date().toISOString();

  const existingCats = await getLocalCategories(workspaceId);
  const byName = new Map(existingCats.map((c) => [c.name, c]));
  const categories: Category[] = [...existingCats];
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
  await saveLocalCategories(workspaceId, categories);

  const localNotes = await getLocalNotes(workspaceId);
  const uiNoteRows: Note[] = (ui.notes || []).map((n: Record<string, unknown>) => {
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
    return {
      id,
      workspace_id: workspaceId,
      text,
      category_id: categoryId,
      created_at: createdRaw,
      updated_at: updatedRaw,
    };
  });
  await saveLocalNotes(workspaceId, mergeNotesById(localNotes, uiNoteRows));

  const localArch = await getLocalArchivedNotes(workspaceId);
  const uiArch: ArchivedNote[] = Object.values(ui.archivedNotes || {}).map(
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
  await saveLocalArchivedNotes(workspaceId, mergeArchivedById(localArch, uiArch));
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

  const idToName = new Map(cats.map((c) => [c.id, c.name]));
  const categoryNames = [...cats]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.name);

  const uiNotes = notes.map((n) => ({
    id: n.id,
    text: n.text,
    category: n.category_id ? (idToName.get(n.category_id) ?? null) : null,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
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
