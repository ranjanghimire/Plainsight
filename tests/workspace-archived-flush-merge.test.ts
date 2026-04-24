import { describe, expect, it } from 'vitest';
import { mergeLocalArchivedWithUiArchived } from '../src/sync/workspaceStorageBridge';
import type { ArchivedNote } from '../src/sync/types';

const row = (id: string, last: string): ArchivedNote => ({
  id,
  workspace_id: 'ws',
  text: 't',
  category_id: null,
  last_deleted_at: last,
  created_at: last,
});

describe('mergeLocalArchivedWithUiArchived', () => {
  it('drops local-only rows (UI removed the archive entry, e.g. restore)', () => {
    const local: ArchivedNote[] = [row('a', '2020-01-02T00:00:00.000Z')];
    const ui: ArchivedNote[] = [];
    expect(mergeLocalArchivedWithUiArchived(local, ui)).toEqual([]);
  });

  it('keeps UI rows and prefers newer last_deleted_at when both exist', () => {
    const local: ArchivedNote[] = [row('x', '2020-01-03T00:00:00.000Z')];
    const ui: ArchivedNote[] = [row('x', '2020-01-01T00:00:00.000Z')];
    const out = mergeLocalArchivedWithUiArchived(local, ui);
    expect(out).toHaveLength(1);
    expect(out[0].last_deleted_at).toBe('2020-01-03T00:00:00.000Z');
  });

  it('uses UI row when only in UI', () => {
    const ui: ArchivedNote[] = [row('n', '2020-01-01T00:00:00.000Z')];
    expect(mergeLocalArchivedWithUiArchived([], ui)).toEqual(ui);
  });
});
