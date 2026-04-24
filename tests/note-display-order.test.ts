import { describe, expect, it } from 'vitest';
import {
  noteUpdatedTsMs,
  stabilizeWorkspaceNotesOrder,
} from '../src/utils/noteDisplayOrder';

describe('noteUpdatedTsMs', () => {
  it('reads updatedAt', () => {
    expect(noteUpdatedTsMs({ updatedAt: 5 })).toBe(5);
  });

  it('reads updated_at ISO string', () => {
    const t = '2020-01-02T00:00:00.000Z';
    expect(noteUpdatedTsMs({ updated_at: t })).toBe(Date.parse(t));
  });
});

describe('stabilizeWorkspaceNotesOrder', () => {
  it('preserves prev order when incoming is re-sorted by time', () => {
    const a = { id: 'a', updated_at: '2020-01-01T00:00:00.000Z' };
    const b = { id: 'b', updated_at: '2020-01-02T00:00:00.000Z' };
    const c = { id: 'c', updated_at: '2020-01-03T00:00:00.000Z' };
    const prevIds = ['a', 'b', 'c'];
    const incoming = [c, b, a];
    expect(stabilizeWorkspaceNotesOrder(prevIds, incoming).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('appends unknown ids newest-first', () => {
    const a = { id: 'a', updated_at: '2020-01-01T00:00:00.000Z' };
    const b = { id: 'b', updated_at: '2020-01-02T00:00:00.000Z' };
    const d = { id: 'd', updated_at: '2020-01-04T00:00:00.000Z' };
    const e = { id: 'e', updated_at: '2020-01-03T00:00:00.000Z' };
    const prevIds = ['a', 'b'];
    const incoming = [d, e, b, a];
    expect(stabilizeWorkspaceNotesOrder(prevIds, incoming).map((n) => n.id)).toEqual([
      'a',
      'b',
      'd',
      'e',
    ]);
  });

  it('with empty prev, sorts all by updated time desc', () => {
    const a = { id: 'a', updated_at: '2020-01-01T00:00:00.000Z' };
    const b = { id: 'b', updated_at: '2020-01-03T00:00:00.000Z' };
    const c = { id: 'c', updated_at: '2020-01-02T00:00:00.000Z' };
    expect(stabilizeWorkspaceNotesOrder([], [a, c, b]).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });
});
