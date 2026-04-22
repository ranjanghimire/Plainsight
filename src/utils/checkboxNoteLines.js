/**
 * Checklist lines in note bodies: same indent rules as hyphen bullets, marker `[ ]` / `[x]`.
 * Used by useNoteFormatModes and read-only note display toggles.
 */

/** Leading indent + `[ ]` or `[x]` / `[X]` + following whitespace. */
const CHECKBOX_LEAD = /^(\s*)\[( |x|X)\]\s*(.*)$/;

export function isCheckboxLine(lineNorm) {
  const t = String(lineNorm || '').replace(/\r/g, '');
  if (/^\s*\[( |x|X)\]\s*$/.test(t)) return true;
  return /^(\s*)\[( |x|X)\]\s/.test(t);
}

export function stripCheckboxMarkFromLine(lineNorm) {
  return String(lineNorm || '').replace(/^(\s*)\[( |x|X)\]\s*/, '');
}

/**
 * Toggle checked state for one line in a body (0-based line index). No-op if that line is not a checkbox line.
 * @returns {string} updated body (may be unchanged)
 */
export function toggleCheckboxLineInBody(body, lineIndex) {
  const doc = String(body ?? '');
  const lines = doc.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return doc;
  const raw = lines[lineIndex];
  const line = raw.replace(/\r/g, '');
  const m = line.match(CHECKBOX_LEAD);
  if (!m) return doc;
  const indent = m[1];
  const inner = m[2];
  const rest = m[3] ?? '';
  const checked = inner === 'x' || inner === 'X';
  const nextInner = checked ? ' ' : 'x';
  const nextLine = `${indent}[${nextInner}] ${rest}`;
  const out = [...lines];
  out[lineIndex] = nextLine;
  return out.join('\n');
}
