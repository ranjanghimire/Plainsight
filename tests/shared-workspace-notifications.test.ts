import { beforeEach, describe, expect, it } from 'vitest';
import {
  readSharedWorkspaceUnread,
  markSharedWorkspaceUnread,
  clearSharedWorkspaceUnread,
  hasAnySharedWorkspaceUnread,
} from '../src/sync/sharedWorkspaceUnread';

describe('sharedWorkspaceUnread', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks and clears per-workspace unread', () => {
    expect(hasAnySharedWorkspaceUnread()).toBe(false);
    markSharedWorkspaceUnread('w1', 123);
    const afterMark = readSharedWorkspaceUnread();
    expect(afterMark.w1).toBe(123);
    expect(hasAnySharedWorkspaceUnread(afterMark)).toBe(true);

    clearSharedWorkspaceUnread('w1');
    const afterClear = readSharedWorkspaceUnread();
    expect(afterClear.w1).toBeUndefined();
    expect(hasAnySharedWorkspaceUnread(afterClear)).toBe(false);
  });

  it('ignores empty ids and does not throw on junk storage', () => {
    localStorage.setItem('plainsight_shared_workspace_unread_v1', 'not json');
    expect(readSharedWorkspaceUnread()).toEqual({});
    markSharedWorkspaceUnread('', 1);
    expect(readSharedWorkspaceUnread()).toEqual({});
  });
});

