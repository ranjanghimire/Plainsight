/**
 * Regression: fullSync removed local note tombstones after `pushNoteDeletes` reported success.
 * A collaborator (or a delayed fullSync with a stale remote snapshot) could then re-upsert the
 * same ids, so deleted notes reappeared in the main list — same failure mode as archived notes.
 *
 * Policy: keep note tombstones in IndexedDB after a successful remote delete; merge + realtime
 * use them to ignore stale rows (`applyNoteTombstoneFilter`, `applyRealtimeNoteChange`).
 */
import { describe, expect, it } from 'vitest';
import { applyNoteTombstoneFilter, mergeNotes } from '../src/sync/mergeLogic';
import type { Note, NoteTombstone } from '../src/sync/types';

const WID = 'dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee';

function makeNote(id: string, text: string): Note {
  const t = new Date().toISOString();
  return { id, workspace_id: WID, text, category_id: null, created_at: t, updated_at: t };
}

describe('note tombstones retained after successful server delete (shared workspace)', () => {
  it('single remote row with tomb → filtered out (stale replay)', () => {
    const n = makeNote('90000000-0000-4000-8000-000000000001', 'peer ghost');
    const pre = mergeNotes([], [n]).merged;
    const tombs: NoteTombstone[] = [
      { id: n.id, workspace_id: WID, deleted_at: '2026-04-26T12:00:00.000Z' },
    ];
    const { merged: after, changed } = applyNoteTombstoneFilter(pre, tombs);
    expect(changed).toBe(true);
    expect(after).toHaveLength(0);
  });

  it('batch: 6 remote rows, 2 tombstoned → 4 remain (subset resurrection)', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      makeNote(`91000000-0000-4000-8000-${String(6000 + i).padStart(12, '0')}`, `note ${i}`),
    );
    const [dead0, dead1, ...stay] = six;
    const pre = mergeNotes([], six).merged;
    const tombs: NoteTombstone[] = [
      { id: dead0.id, workspace_id: WID, deleted_at: '2026-04-26T12:00:00.000Z' },
      { id: dead1.id, workspace_id: WID, deleted_at: '2026-04-26T12:00:01.000Z' },
    ];
    const { merged: after, changed } = applyNoteTombstoneFilter(pre, tombs);
    expect(changed).toBe(true);
    expect(after).toHaveLength(4);
    const kept = new Set(after.map((n) => n.id));
    for (const n of stay) expect(kept.has(n.id)).toBe(true);
    expect(kept.has(dead0.id)).toBe(false);
    expect(kept.has(dead1.id)).toBe(false);
  });
});
