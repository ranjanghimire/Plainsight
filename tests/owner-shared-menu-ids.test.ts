import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getOwnerSharedWorkspaceIdsForMenu,
  setOwnerSharedWorkspaceIdsCache,
} from '../src/utils/storage';
import { clearPlainsightStorage } from './categoryTestHarness';

const W1 = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
const W2 = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

describe('getOwnerSharedWorkspaceIdsForMenu', () => {
  beforeEach(() => {
    clearPlainsightStorage();
  });

  afterEach(() => {
    clearPlainsightStorage();
  });

  it('merges live owner rows with persisted cache when custom auth session', () => {
    setOwnerSharedWorkspaceIdsCache(new Set([W1]));
    const rows = [{ isOwner: true, workspaceId: W2, workspaceName: 'B' }];
    const s = getOwnerSharedWorkspaceIdsForMenu(rows, true);
    expect(s.has(W1)).toBe(true);
    expect(s.has(W2)).toBe(true);
    expect(s.size).toBe(2);
  });

  it('uses cache for cold start before shared rows hydrate (session true, empty rows)', () => {
    setOwnerSharedWorkspaceIdsCache(new Set([W1]));
    const s = getOwnerSharedWorkspaceIdsForMenu([], true);
    expect([...s]).toEqual([W1]);
  });

  it('does not read cache without custom auth session', () => {
    setOwnerSharedWorkspaceIdsCache(new Set([W1]));
    expect(getOwnerSharedWorkspaceIdsForMenu([], false).size).toBe(0);
  });
});
