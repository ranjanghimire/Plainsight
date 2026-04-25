import { describe, expect, it } from 'vitest';
import { mergeArchivedNotes } from '../src/sync/mergeLogic';
import { archivedRowIdForText } from '../src/sync/workspaceStorageBridge';
import type { ArchivedNote } from '../src/sync/types';

/**
 * Archived note ids are deterministic (workspace + note body). After a row was removed from
 * the server, the same body archived again must merge as local-only, not be dropped.
 */
describe('mergeArchivedNotes — recycled deterministic id', () => {
  const wid = 'dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee';
  const body = 'Meeting notes';
  const id = archivedRowIdForText(wid, body);

  it('keeps local-only row when remote is empty (same id may have been on server before)', () => {
    const local: ArchivedNote[] = [
      {
        id,
        workspace_id: wid,
        text: body,
        category_id: null,
        last_deleted_at: new Date().toISOString(),
        created_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    const { merged, toPush } = mergeArchivedNotes(local, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(id);
    expect(toPush).toHaveLength(1);
  });
});
