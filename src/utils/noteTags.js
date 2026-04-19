/**
 * Notes may store tags on the first line as `#a #b` followed by `\n` and the body.
 * If the first line is not a pure hashtag line, the full string is treated as body (no tags).
 */

/**
 * Remove trailing lines that are empty or whitespace-only, and trailing spaces on the last
 * kept line (avoids tall cards from Enter-spam with no text).
 */
export function trimTrailingBlankLines(body) {
  if (typeof body !== 'string' || !body) return '';
  const lines = body.split(/\n/);
  while (lines.length > 0 && lines[lines.length - 1].replace(/\r/g, '').trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return '';
  lines[lines.length - 1] = lines[lines.length - 1].replace(/[\t \u00a0]+$/u, '');
  return lines.join('\n');
}

export function parseNoteBodyAndTags(raw) {
  if (typeof raw !== 'string' || !raw) return { tags: [], body: '' };
  const lines = raw.split(/\r?\n/);
  const first = (lines[0] ?? '').trim();
  if (!first || !/^(#[a-z0-9_]+)(\s+#[a-z0-9_]+)*$/i.test(first)) {
    return { tags: [], body: raw };
  }
  const tags = [];
  const seen = new Set();
  const re = /#([a-z0-9_]+)/gi;
  let m;
  while ((m = re.exec(first)) != null) {
    const t = String(m[1] || '').toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    tags.push(t);
  }
  const body = lines.slice(1).join('\n');
  return { tags, body };
}

export function normalizeTagSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Raw tag draft field: strip leading `#` and collapse duplicate `#` (composer / SearchCommandBar). */
export function normalizeTagDraftInput(raw) {
  let v = String(raw ?? '');
  v = v.replace(/^#+/, '');
  v = v.replace(/\s+#+/g, ' #');
  return v;
}

/**
 * Draft after the UI `#` prefix: segments separated by ` # ` (Space inserts ` #` between tags).
 * Used by SearchCommandBar and NoteCard edit tag row.
 */
export function tagDraftToHashtagLine(draft) {
  let t = String(draft || '').trim();
  if (!t) return '';
  t = t.replace(/^#+/, '');
  t = t.replace(/\s+#+/g, ' #');
  t = t.replace(/\s+#\s*$/, '');
  if (!t) return '';
  const segments = t
    .split(/\s+#\s*/)
    .map((s) => s.trim().replace(/^#+/, '').replace(/\s+/g, '_'))
    .filter(Boolean);
  if (segments.length === 0) return '';
  return segments.map((s) => `#${s}`).join(' ');
}

export function parseTagsFromDraft(draft) {
  const line = tagDraftToHashtagLine(draft);
  if (!line) return [];
  const out = [];
  const seen = new Set();
  const re = /#([a-z0-9_]+)/gi;
  let m;
  while ((m = re.exec(line)) != null) {
    const t = String(m[1] || '').toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Inverse of multi-tag draft: `a #b` for tags `['a','b']`. */
export function tagsToTagDraft(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.filter(Boolean).join(' #');
}

/** Remove one tag from the hashtag line; leaves body and non–tag-line notes unchanged. */
export function removeTagFromNoteText(raw, tagSlug) {
  const target = normalizeTagSlug(tagSlug);
  if (!target) return typeof raw === 'string' ? raw : '';
  const { tags, body } = parseNoteBodyAndTags(typeof raw === 'string' ? raw : '');
  if (tags.length === 0 || !tags.includes(target)) {
    return typeof raw === 'string' ? raw : '';
  }
  const next = tags.filter((t) => t !== target);
  return composeNoteWithTags(next, body);
}

/** Rename a tag in the hashtag line (normalized slugs). */
export function renameTagInNoteText(raw, oldSlug, newSlug) {
  const o = normalizeTagSlug(oldSlug);
  const n = normalizeTagSlug(newSlug);
  if (!o || !n || o === n) return typeof raw === 'string' ? raw : '';
  const { tags, body } = parseNoteBodyAndTags(typeof raw === 'string' ? raw : '');
  if (tags.length === 0 || !tags.includes(o)) {
    return typeof raw === 'string' ? raw : '';
  }
  let next;
  if (tags.includes(n)) {
    next = tags.filter((t) => t !== o);
  } else {
    next = tags.map((t) => (t === o ? n : t));
  }
  return composeNoteWithTags(next, body);
}

export function composeNoteWithTags(tags, body) {
  const b = trimTrailingBlankLines(typeof body === 'string' ? body : '');
  const list = Array.isArray(tags)
    ? [
        ...new Set(
          tags
            .map((t) =>
              String(t)
                .toLowerCase()
                .trim()
                .replace(/^#+/, '')
                .replace(/\s+/g, '_'),
            )
            .filter(Boolean),
        ),
      ]
    : [];
  if (list.length === 0) return b;
  const line = list.map((t) => `#${t}`).join(' ');
  return b ? `${line}\n${b}` : line;
}
