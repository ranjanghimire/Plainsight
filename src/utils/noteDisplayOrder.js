/** Milliseconds for a note's last-edit time (local camelCase or API snake_case). */
export function noteUpdatedTsMs(n) {
  if (!n || typeof n !== 'object') return 0;
  const u = n.updatedAt ?? n.updated_at;
  if (u == null) return 0;
  if (typeof u === 'number' && Number.isFinite(u)) return u;
  const t = Date.parse(String(u));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Keeps stable on-screen order while merging refreshed `incomingNotes`.
 * Reuses `prevIds` order for notes still present; appends notes not in `prevIds`,
 * newest-first by edit time (e.g. collaborator adds).
 */
export function stabilizeWorkspaceNotesOrder(prevIds, incomingNotes) {
  const list = Array.isArray(incomingNotes) ? incomingNotes : [];
  const idStr = (id) => (id != null ? String(id) : '');
  const byId = new Map();
  for (const note of list) {
    if (!note || typeof note !== 'object') continue;
    const id = idStr(note.id);
    if (!id) continue;
    byId.set(id, note);
  }
  const prev = Array.isArray(prevIds) ? prevIds.map(idStr).filter(Boolean) : [];
  const seen = new Set();
  const out = [];
  for (const id of prev) {
    const n = byId.get(id);
    if (!n) continue;
    out.push(n);
    seen.add(id);
  }
  const extra = [];
  for (const [id, note] of byId) {
    if (seen.has(id)) continue;
    extra.push(note);
  }
  extra.sort((a, b) => noteUpdatedTsMs(b) - noteUpdatedTsMs(a));
  return out.concat(extra);
}
