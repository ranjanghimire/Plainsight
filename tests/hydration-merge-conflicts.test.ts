/**
 * Timestamp merge rules used during hydration for notes (via mergeNotes / mergeCategories in fullSync).
 * Workspace *rows* in fullSync use `mergeRemoteAndLocalWorkspaces` (remote snapshot wins on matching id),
 * not `mergeWorkspaces` here — these tests lock last-write-wins for entities that use mergeLogic.
 */

import { describe, expect, it } from 'vitest';
import { findRedundantNumberedVisibleWorkspaceIds } from '../src/sync/syncEngine';
import {
  mergeArchivedNotes,
  mergeCategories,
  mergeNotes,
  mergeWorkspacePins,
  mergeWorkspaces,
} from '../src/sync/mergeLogic';
import type { ArchivedNote, Category, Note, Workspace, WorkspacePin } from '../src/sync/types';
import { createHydrationTestWorkspaceId } from './hydration/hydrationTestIds';

const MERGE_WORKSPACE_ROW_ID = createHydrationTestWorkspaceId();
const MERGE_NOTE_WORKSPACE_ID = createHydrationTestWorkspaceId();
const MERGE_CAT_WORKSPACE_ID = createHydrationTestWorkspaceId();
const MERGE_ARCH_WORKSPACE_ID = createHydrationTestWorkspaceId();
const MERGE_PIN_USER_ID = createHydrationTestWorkspaceId();
const MERGE_PIN_WS_ID = createHydrationTestWorkspaceId();

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

describe('hydration merge — categories (mergeCategories)', () => {
  const cat = (id: string, name: string, updated_at: string): Category => ({
    id,
    workspace_id: MERGE_CAT_WORKSPACE_ID,
    name,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at,
  });

  it('remote wins when remote updated_at is newer', () => {
    const local = [cat('c1', 'Local cat', '2020-06-01T00:00:00.000Z')];
    const remote = [cat('c1', 'Remote cat', '2021-06-01T00:00:00.000Z')];
    const { merged } = mergeCategories(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Remote cat');
  });

  it('local wins when local updated_at is newer', () => {
    const local = [cat('c1', 'Local wins', '2030-01-01T00:00:00.000Z')];
    const remote = [cat('c1', 'Remote stale', '2022-01-01T00:00:00.000Z')];
    const { merged } = mergeCategories(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Local wins');
  });

  it('union by id: local-only pushes, remote-only pulls', () => {
    const local = [cat('c-local', 'Only local', '2020-01-01T00:00:00.000Z')];
    const remote = [cat('c-remote', 'Only remote', '2020-02-01T00:00:00.000Z')];
    const { merged, toPush, toPull } = mergeCategories(local, remote);
    expect(merged.map((x) => x.id).sort()).toEqual(['c-local', 'c-remote']);
    expect(toPush.map((x) => x.id)).toEqual(['c-local']);
    expect(toPull.map((x) => x.id)).toEqual(['c-remote']);
  });
});

describe('hydration merge — archived notes (mergeArchivedNotes)', () => {
  const arch = (
    id: string,
    text: string,
    last_deleted_at: string,
    created_at = '2020-01-01T00:00:00.000Z',
  ): ArchivedNote => ({
    id,
    workspace_id: MERGE_ARCH_WORKSPACE_ID,
    text,
    category_id: null,
    last_deleted_at,
    created_at,
  });

  it('remote wins when remote last_deleted_at is newer', () => {
    const local = [arch('a1', 'body', '2020-01-01T00:00:00.000Z')];
    const remote = [arch('a1', 'body', '2022-01-01T00:00:00.000Z')];
    const { merged } = mergeArchivedNotes(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].last_deleted_at).toBe('2022-01-01T00:00:00.000Z');
  });

  it('local wins when local last_deleted_at is newer', () => {
    const local = [arch('a1', 'local wins', '2030-01-01T00:00:00.000Z')];
    const remote = [arch('a1', 'remote stale', '2022-01-01T00:00:00.000Z')];
    const { merged } = mergeArchivedNotes(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('local wins');
  });
});

describe('hydration merge — workspace pins (mergeWorkspacePins)', () => {
  const pin = (
    workspace_id: string,
    position: number,
    created_at: string,
  ): WorkspacePin => ({
    user_id: MERGE_PIN_USER_ID,
    workspace_id,
    position,
    created_at,
  });

  it('same user+workspace: remote wins when remote created_at is newer', () => {
    const ws = MERGE_PIN_WS_ID;
    const local = [pin(ws, 0, '2020-01-01T00:00:00.000Z')];
    const remote = [pin(ws, 1, '2021-01-01T00:00:00.000Z')];
    const { merged } = mergeWorkspacePins(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].position).toBe(1);
    expect(merged[0].created_at).toBe('2021-01-01T00:00:00.000Z');
  });

  it('same user+workspace: local wins when local created_at is newer', () => {
    const ws = MERGE_PIN_WS_ID;
    const local = [pin(ws, 2, '2030-01-01T00:00:00.000Z')];
    const remote = [pin(ws, 0, '2021-01-01T00:00:00.000Z')];
    const { merged } = mergeWorkspacePins(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].position).toBe(2);
  });

  it('sorts merged pins by ascending position', () => {
    const wsA = createHydrationTestWorkspaceId();
    const wsB = createHydrationTestWorkspaceId();
    const local = [pin(wsB, 10, '2020-01-01T00:00:00.000Z'), pin(wsA, 0, '2020-01-01T00:00:00.000Z')];
    const remote: WorkspacePin[] = [];
    const { merged } = mergeWorkspacePins(local, remote);
    expect(merged.map((p) => p.position)).toEqual([0, 10]);
  });
});

describe('numbered visible workspace prune (canonical Home vs Home (2))', () => {
  const vis = (id: string, name: string): Workspace => ({
    id,
    owner_id: 'o',
    name,
    kind: 'visible',
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
  });

  it('flags Home (2) redundant when a visible workspace named Home exists', () => {
    const homeId = createHydrationTestWorkspaceId();
    const dupId = createHydrationTestWorkspaceId();
    const secondId = createHydrationTestWorkspaceId();
    const ids = findRedundantNumberedVisibleWorkspaceIds([
      vis(homeId, 'Home'),
      vis(dupId, 'Home (2)'),
      vis(secondId, 'Second'),
    ]);
    expect(ids).toContain(dupId);
    expect(ids).not.toContain(homeId);
    expect(ids).not.toContain(secondId);
  });

  it('does not flag Home (2) when no canonical Home row', () => {
    const dupId = createHydrationTestWorkspaceId();
    const ids = findRedundantNumberedVisibleWorkspaceIds([vis(dupId, 'Home (2)')]);
    expect(ids).toHaveLength(0);
  });
});
