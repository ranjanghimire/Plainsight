import type { ArchivedNote, Note } from './types';
import { parseNoteBodyAndTags } from '../utils/noteTags';

export function noteTagRowsFromNotes(notes: Note[]): { note_id: string; tag: string }[] {
  const rows: { note_id: string; tag: string }[] = [];
  for (const n of notes) {
    const { tags } = parseNoteBodyAndTags(typeof n.text === 'string' ? n.text : '');
    for (const tag of tags) {
      rows.push({ note_id: n.id, tag });
    }
  }
  return rows;
}

export function archivedNoteTagRowsFromArchived(
  rows: ArchivedNote[],
): { archived_note_id: string; tag: string }[] {
  const out: { archived_note_id: string; tag: string }[] = [];
  for (const n of rows) {
    const { tags } = parseNoteBodyAndTags(typeof n.text === 'string' ? n.text : '');
    for (const tag of tags) {
      out.push({ archived_note_id: n.id, tag });
    }
  }
  return out;
}
