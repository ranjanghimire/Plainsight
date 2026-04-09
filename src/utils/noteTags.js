/**
 * Notes may store tags on the first line as `#a #b` followed by `\n` and the body.
 * If the first line is not a pure hashtag line, the full string is treated as body (no tags).
 */

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

export function composeNoteWithTags(tags, body) {
  const b = typeof body === 'string' ? body : '';
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
  const trimmedBody = b.replace(/\s+$/u, '');
  return trimmedBody ? `${line}\n${trimmedBody}` : line;
}
