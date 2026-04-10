import type {
  ArchivedNoteTombstone,
  ArchivedNote,
  Category,
  CategoryTombstone,
  Note,
  NoteTombstone,
  NoteTag,
  ArchivedNoteTag,
  Workspace,
  WorkspacePin,
} from './types';

/**
 * Minimal local DB adapter.
 *
 * This app currently persists its core data via localStorage-driven helpers.
 * For Supabase sync, we provide an async interface that can be swapped with
 * SQLite / Capacitor DataStorage later.
 */

const KEY = {
  workspaces: 'plainsight_local_workspaces',
  categories: (workspaceId: string) => `plainsight_local_categories_${workspaceId}`,
  categoryTombstones: (workspaceId: string) => `plainsight_local_category_tombstones_${workspaceId}`,
  notes: (workspaceId: string) => `plainsight_local_notes_${workspaceId}`,
  noteTombstones: (workspaceId: string) => `plainsight_local_note_tombstones_${workspaceId}`,
  archived: (workspaceId: string) => `plainsight_local_archived_${workspaceId}`,
  archivedTombstones: (workspaceId: string) => `plainsight_local_archived_tombstones_${workspaceId}`,
  noteTags: (workspaceId: string) => `plainsight_local_note_tags_${workspaceId}`,
  archivedNoteTags: (workspaceId: string) => `plainsight_local_archived_note_tags_${workspaceId}`,
  pins: 'plainsight_local_workspace_pins',
} as const;

function readJson<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export async function getLocalWorkspaces(): Promise<Workspace[]> {
  return readJson<Workspace[]>(KEY.workspaces, []);
}

export async function saveLocalWorkspaces(rows: Workspace[]): Promise<void> {
  writeJson(KEY.workspaces, rows);
}

/** Drop cached categories/notes/archived/tombstones for one workspace (e.g. after delete). */
export async function clearLocalWorkspaceData(workspaceId: string): Promise<void> {
  if (!workspaceId) return;
  try {
    localStorage.removeItem(KEY.categories(workspaceId));
    localStorage.removeItem(KEY.categoryTombstones(workspaceId));
    localStorage.removeItem(KEY.notes(workspaceId));
    localStorage.removeItem(KEY.archived(workspaceId));
    localStorage.removeItem(KEY.noteTombstones(workspaceId));
    localStorage.removeItem(KEY.archivedTombstones(workspaceId));
    localStorage.removeItem(KEY.noteTags(workspaceId));
    localStorage.removeItem(KEY.archivedNoteTags(workspaceId));
  } catch {
    /* ignore */
  }
}

export async function getLocalCategories(workspaceId: string): Promise<Category[]> {
  return readJson<Category[]>(KEY.categories(workspaceId), []);
}

export async function saveLocalCategories(workspaceId: string, rows: Category[]): Promise<void> {
  writeJson(KEY.categories(workspaceId), rows);
}

export async function getLocalCategoryTombstones(workspaceId: string): Promise<CategoryTombstone[]> {
  return readJson<CategoryTombstone[]>(KEY.categoryTombstones(workspaceId), []);
}

export async function saveLocalCategoryTombstones(
  workspaceId: string,
  rows: CategoryTombstone[],
): Promise<void> {
  writeJson(KEY.categoryTombstones(workspaceId), rows);
}

export async function getLocalNotes(workspaceId: string): Promise<Note[]> {
  return readJson<Note[]>(KEY.notes(workspaceId), []);
}

export async function saveLocalNotes(workspaceId: string, rows: Note[]): Promise<void> {
  writeJson(KEY.notes(workspaceId), rows);
}

export async function getLocalNoteTombstones(workspaceId: string): Promise<NoteTombstone[]> {
  return readJson<NoteTombstone[]>(KEY.noteTombstones(workspaceId), []);
}

export async function saveLocalNoteTombstones(workspaceId: string, rows: NoteTombstone[]): Promise<void> {
  writeJson(KEY.noteTombstones(workspaceId), rows);
}

export async function getLocalArchivedNotes(workspaceId: string): Promise<ArchivedNote[]> {
  return readJson<ArchivedNote[]>(KEY.archived(workspaceId), []);
}

export async function saveLocalArchivedNotes(workspaceId: string, rows: ArchivedNote[]): Promise<void> {
  writeJson(KEY.archived(workspaceId), rows);
}

export async function getLocalArchivedNoteTombstones(workspaceId: string): Promise<ArchivedNoteTombstone[]> {
  return readJson<ArchivedNoteTombstone[]>(KEY.archivedTombstones(workspaceId), []);
}

export async function saveLocalArchivedNoteTombstones(workspaceId: string, rows: ArchivedNoteTombstone[]): Promise<void> {
  writeJson(KEY.archivedTombstones(workspaceId), rows);
}

/** Flat rows (workspace implied by key); matches Supabase `note_tags` sans workspace_id column in JSON. */
export async function getLocalNoteTags(workspaceId: string): Promise<Pick<NoteTag, 'note_id' | 'tag'>[]> {
  return readJson<Pick<NoteTag, 'note_id' | 'tag'>[]>(KEY.noteTags(workspaceId), []);
}

export async function saveLocalNoteTags(
  workspaceId: string,
  rows: Pick<NoteTag, 'note_id' | 'tag'>[],
): Promise<void> {
  writeJson(KEY.noteTags(workspaceId), rows);
}

export async function getLocalArchivedNoteTags(
  workspaceId: string,
): Promise<Pick<ArchivedNoteTag, 'archived_note_id' | 'tag'>[]> {
  return readJson<Pick<ArchivedNoteTag, 'archived_note_id' | 'tag'>[]>(
    KEY.archivedNoteTags(workspaceId),
    [],
  );
}

export async function saveLocalArchivedNoteTags(
  workspaceId: string,
  rows: Pick<ArchivedNoteTag, 'archived_note_id' | 'tag'>[],
): Promise<void> {
  writeJson(KEY.archivedNoteTags(workspaceId), rows);
}

export async function getLocalWorkspacePins(): Promise<WorkspacePin[]> {
  return readJson<WorkspacePin[]>(KEY.pins, []);
}

export async function saveLocalWorkspacePins(rows: WorkspacePin[]): Promise<void> {
  writeJson(KEY.pins, rows);
}

