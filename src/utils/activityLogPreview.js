/**
 * Short preview for workspace activity logs (shared with collaborators who can read the log).
 * Uses the first few words of note text; omit if empty.
 */
export function firstWordsNotePreview(text, maxWords = 3) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const words = t.split(' ').filter(Boolean);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(' ')}…`;
}
