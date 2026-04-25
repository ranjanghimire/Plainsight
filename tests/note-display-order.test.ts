import { describe, expect, it } from 'vitest';
import { sortNotesNewestFirst, stabilizeWorkspaceNotesOrder } from '../src/utils/noteDisplayOrder';

describe('noteDisplayOrder', () => {
  it('stabilizeWorkspaceNotesOrder: unseen note ids prepended (newest among extras first)', () => {
    const t0 = '2020-01-01T00:00:00.000Z';
    const t1 = '2020-01-02T00:00:00.000Z';
    const t2 = '2020-01-03T00:00:00.000Z';
    const existing = { id: 'a', text: 'a', createdAt: t0, updatedAt: t0 };
    const olderNew = { id: 'b', text: 'b', createdAt: t1, updatedAt: t1 };
    const newerNew = { id: 'c', text: 'c', createdAt: t2, updatedAt: t2 };
    const prevIds = ['a'];
    const incoming = [existing, olderNew, newerNew];
    const out = stabilizeWorkspaceNotesOrder(prevIds, incoming);
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('sortNotesNewestFirst', () => {
    const t0 = '2020-01-01T00:00:00.000Z';
    const t2 = '2020-01-03T00:00:00.000Z';
    const rows = [
      { id: 'x', updated_at: t0 },
      { id: 'y', updated_at: t2 },
    ];
    const out = sortNotesNewestFirst(rows);
    expect(out.map((n) => n.id)).toEqual(['y', 'x']);
  });
});
