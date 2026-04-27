import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldShowSharedWorkspacesMenuContent } from '../src/sync/syncEnabled';
import { setOwnerSharedWorkspaceIdsCache } from '../src/utils/storage';
import { clearPlainsightStorage } from './categoryTestHarness';

describe('shouldShowSharedWorkspacesMenuContent', () => {
  beforeEach(() => {
    clearPlainsightStorage();
  });

  afterEach(() => {
    clearPlainsightStorage();
  });

  it('is false without custom auth session', () => {
    expect(
      shouldShowSharedWorkspacesMenuContent({
        hasCustomAuthSession: false,
        syncEntitled: true,
        syncRemoteActive: true,
        sharedRowCount: 1,
        pendingInviteCount: 0,
        ownerSharedWorkspaceIdCacheSize: 0,
      }),
    ).toBe(false);
  });

  it('is true when live flags are on', () => {
    expect(
      shouldShowSharedWorkspacesMenuContent({
        hasCustomAuthSession: true,
        syncEntitled: true,
        syncRemoteActive: true,
        sharedRowCount: 0,
        pendingInviteCount: 0,
        ownerSharedWorkspaceIdCacheSize: 0,
      }),
    ).toBe(true);
  });

  it('is true on cold start when owner id cache is populated (flags not yet true)', () => {
    setOwnerSharedWorkspaceIdsCache(new Set(['aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee']));
    expect(
      shouldShowSharedWorkspacesMenuContent({
        hasCustomAuthSession: true,
        syncEntitled: false,
        syncRemoteActive: false,
        sharedRowCount: 0,
        pendingInviteCount: 0,
        ownerSharedWorkspaceIdCacheSize: 1,
      }),
    ).toBe(true);
  });

  it('is true with accepted rows and flags still loading', () => {
    expect(
      shouldShowSharedWorkspacesMenuContent({
        hasCustomAuthSession: true,
        syncEntitled: false,
        syncRemoteActive: false,
        sharedRowCount: 1,
        pendingInviteCount: 0,
        ownerSharedWorkspaceIdCacheSize: 0,
      }),
    ).toBe(true);
  });
});
