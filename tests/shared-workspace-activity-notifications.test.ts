import { describe, expect, it } from 'vitest';
import { shouldMarkUnreadForSharedActivity } from '../src/sync/sharedWorkspaceActivityNotifications';

describe('sharedWorkspaceActivityNotifications', () => {
  it('shouldMarkUnreadForSharedActivity: other actor, not active workspace → true', () => {
    expect(
      shouldMarkUnreadForSharedActivity({
        payload: {
          event: 'INSERT',
          newRow: { actor_user_id: 'u2', action: 'note_added' },
          oldRow: null,
        },
        myUserId: 'u1',
        workspaceId: 'ws-a',
        activeWorkspaceId: 'ws-b',
      }),
    ).toBe(true);
  });

  it('shouldMarkUnreadForSharedActivity: own actor → false', () => {
    expect(
      shouldMarkUnreadForSharedActivity({
        payload: {
          event: 'INSERT',
          newRow: { actor_user_id: 'u1', action: 'note_added' },
          oldRow: null,
        },
        myUserId: 'u1',
        workspaceId: 'ws-a',
        activeWorkspaceId: 'ws-b',
      }),
    ).toBe(false);
  });

  it('shouldMarkUnreadForSharedActivity: active workspace matches → false', () => {
    expect(
      shouldMarkUnreadForSharedActivity({
        payload: {
          event: 'INSERT',
          newRow: { actor_user_id: 'u2', action: 'note_added' },
          oldRow: null,
        },
        myUserId: 'u1',
        workspaceId: 'ws-a',
        activeWorkspaceId: 'ws-a',
      }),
    ).toBe(false);
  });
});
