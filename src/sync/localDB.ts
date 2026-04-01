import type {
  ArchivedNote,
  Category,
  Note,
  NoteTombstone,
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
  notes: (workspaceId: string) => `plainsight_local_notes_${workspaceId}`,
  noteTombstones: (workspaceId: string) => `plainsight_local_note_tombstones_${workspaceId}`,
  archived: (workspaceId: string) => `plainsight_local_archived_${workspaceId}`,
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

export async function getLocalCategories(workspaceId: string): Promise<Category[]> {
  return readJson<Category[]>(KEY.categories(workspaceId), []);
}

export async function saveLocalCategories(workspaceId: string, rows: Category[]): Promise<void> {
  writeJson(KEY.categories(workspaceId), rows);
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

export async function getLocalWorkspacePins(): Promise<WorkspacePin[]> {
  return readJson<WorkspacePin[]>(KEY.pins, []);
}

export async function saveLocalWorkspacePins(rows: WorkspacePin[]): Promise<void> {
  writeJson(KEY.pins, rows);
}

