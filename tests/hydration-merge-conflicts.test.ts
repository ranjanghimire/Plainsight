/**
 * Timestamp merge rules used during hydration for notes (via mergeNotes / mergeCategories in fullSync).
 * Workspace *rows* in fullSync use `mergeRemoteAndLocalWorkspaces` (remote snapshot wins on matching id),
 * not `mergeWorkspaces` here — these tests lock last-write-wins for entities that use mergeLogic.
 */

import { describe, expect, it } from 'vitest';
import { mergeNotes, mergeWorkspaces } from '../src/sync/mergeLogic';
import type { Note, Workspace } from '../src/sync/types';
import { createHydrationTestWorkspaceId } from './hydration/hydrationTestIds';

const MERGE_WORKSPACE_ROW_ID = createHydrationTestWorkspaceId();
const MERGE_NOTE_WORKSPACE_ID = createHydrationTestWorkspaceId();

const baseWs = (id: string, name: string, updated_at: string): Workspace => ({
  id,
  owner_id: 'owner',
  name,
  kind: 'visible',
  created_at: '2020-01-01T00:00:00.000Z',
  updated_at,
});

describe('hydration merge — workspace rows (mergeWorkspaces)', () => {
  it('remote wins when remote updated_at is newer', () => {
    const local = [baseWs(MERGE_WORKSPACE_ROW_ID, 'Local', '2020-06-01T00:00:00.000Z')];
    const remote = [baseWs(MERGE_WORKSPACE_ROW_ID, 'Remote', '2021-06-01T00:00:00.000Z')];
    const { merged } = mergeWorkspaces(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Remote');
  });

  it('local wins when local updated_at is newer', () => {
    const local = [baseWs(MERGE_WORKSPACE_ROW_ID, 'Local', '2025-06-01T00:00:00.000Z')];
    const remote = [baseWs(MERGE_WORKSPACE_ROW_ID, 'Remote', '2021-06-01T00:00:00.000Z')];
    const { merged } = mergeWorkspaces(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Local');
  });
});

describe('hydration merge — notes (mergeNotes)', () => {
  const note = (id: string, text: string, updated_at: string): Note => ({
    id,
    workspace_id: MERGE_NOTE_WORKSPACE_ID,
    text,
    category_id: null,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at,
  });

  it('remote wins when remote updated_at is newer', () => {
    const local = [note('n1', 'local body', '2020-01-01T00:00:00.000Z')];
    const remote = [note('n1', 'remote body', '2022-01-01T00:00:00.000Z')];
    const { merged } = mergeNotes(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('remote body');
  });

  it('local wins when local updated_at is newer (no stale remote overwrite of content)', () => {
    const local = [note('n1', 'local wins', '2030-01-01T00:00:00.000Z')];
    const remote = [note('n1', 'remote stale', '2022-01-01T00:00:00.000Z')];
    const { merged } = mergeNotes(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('local wins');
  });
});
