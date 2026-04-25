import { afterEach, describe, expect, it } from 'vitest';
import { getHiddenWorkspaceManageEntries } from '../src/utils/storage';

describe('getHiddenWorkspaceManageEntries', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hides numbered duplicates when the base hidden workspace exists (e.g. private + private (2))', () => {
    localStorage.setItem(
      'plainsight_local_workspaces',
      JSON.stringify([
        {
          id: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
          owner_id: 'owner',
          name: 'private',
          kind: 'hidden',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'ffffffff-1111-4ccc-dddd-eeeeeeeeeeee',
          owner_id: 'owner',
          name: 'private (2)',
          kind: 'hidden',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    );
    const out = getHiddenWorkspaceManageEntries().map((e) => e.displayName);
    expect(out).toContain('private');
    expect(out).not.toContain('private (2)');
  });
});

