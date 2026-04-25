import { describe, expect, it } from 'vitest';
import {
  formatSharedWorkspaceNoteNotificationBody,
  shouldMarkUnreadForSharedActivity,
  shouldScheduleIosLocalNotificationForSharedNoteActivity,
} from '../src/sync/sharedWorkspaceActivityNotifications';

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

  it('shouldScheduleIosLocalNotificationForSharedNoteActivity', () => {
    expect(shouldScheduleIosLocalNotificationForSharedNoteActivity({ action: 'note_added' })).toBe(
      true,
    );
    expect(shouldScheduleIosLocalNotificationForSharedNoteActivity({ action: 'note_updated' })).toBe(
      true,
    );
    expect(shouldScheduleIosLocalNotificationForSharedNoteActivity({ action: 'share_invited' })).toBe(
      false,
    );
  });

  it('formatSharedWorkspaceNoteNotificationBody', () => {
    expect(
      formatSharedWorkspaceNoteNotificationBody({
        action: 'note_added',
        workspaceName: 'Team',
      }),
    ).toBe(`A note was created in ‘Team’.`);
    expect(
      formatSharedWorkspaceNoteNotificationBody({
        action: 'note_updated',
        workspaceName: 'Team',
      }),
    ).toBe(`A note was updated in ‘Team’.`);
  });
});
