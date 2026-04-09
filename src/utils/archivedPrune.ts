import type { ArchivedNote } from '../sync/types';
import { MAX_ARCHIVED_ITEMS_PER_WORKSPACE } from '../constants/workspaceLimits';

export { MAX_ARCHIVED_ITEMS_PER_WORKSPACE };

export function pruneArchivedNoteRows(
  rows: ArchivedNote[],
  max: number = MAX_ARCHIVED_ITEMS_PER_WORKSPACE,
): { kept: ArchivedNote[]; removed: ArchivedNote[] } {
  if (!rows?.length || rows.length <= max) return { kept: rows || [], removed: [] };
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.last_deleted_at);
    const tb = Date.parse(b.last_deleted_at);
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (nb !== na) return nb - na;
    return String(b.id).localeCompare(String(a.id));
  });
  return {
    kept: sorted.slice(0, max),
    removed: sorted.slice(max),
  };
}

export type ArchivedUiEntry = {
  text: string;
  category?: string;
  lastDeletedAt: number;
};

/** UI workspace blob shape: keyed by note text. */
export function pruneArchivedNotesUi(
  archivedNotes: Record<string, ArchivedUiEntry> | null | undefined,
  max: number = MAX_ARCHIVED_ITEMS_PER_WORKSPACE,
): { map: Record<string, ArchivedUiEntry>; removedTextKeys: string[] } {
  const raw = archivedNotes && typeof archivedNotes === 'object' ? archivedNotes : {};
  const entries = Object.values(raw);
  if (entries.length <= max) {
    return { map: { ...raw }, removedTextKeys: [] };
  }
  const sorted = [...entries].sort((a, b) => (b.lastDeletedAt || 0) - (a.lastDeletedAt || 0));
  const kept = sorted.slice(0, max);
  const removed = sorted.slice(max);
  const map: Record<string, ArchivedUiEntry> = {};
  for (const e of kept) map[e.text] = e;
  return { map, removedTextKeys: removed.map((e) => e.text) };
}
