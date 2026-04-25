import { describe, expect, it } from 'vitest';
import { computeActivityBadgeCatchup } from '../src/sync/sharedWorkspaceActivityCatchup';

describe('computeActivityBadgeCatchup', () => {
  const base = {
    myUserId: 'user-a',
    workspaceId: 'ws-1',
    activeWorkspaceId: null as string | null,
  };

  it('establishes baseline without unread when no watermark yet', () => {
    const logs = [
      { actor_user_id: 'user-b', created_at: '2026-04-20T10:00:00.000Z' },
      { actor_user_id: 'user-a', created_at: '2026-04-21T12:00:00.000Z' },
    ];
    const out = computeActivityBadgeCatchup(logs, null, base);
    expect(out.shouldMarkUnread).toBe(false);
    expect(out.nextWatermarkIso).toBe('2026-04-21T12:00:00.000Z');
  });

  it('marks unread for collaborator activity after watermark', () => {
    const prev = '2026-04-01T00:00:00.000Z';
    const logs = [
      { actor_user_id: 'user-b', created_at: '2026-04-25T08:00:00.000Z' },
      { actor_user_id: 'user-a', created_at: '2026-04-25T07:00:00.000Z' },
    ];
    const out = computeActivityBadgeCatchup(logs, prev, base);
    expect(out.shouldMarkUnread).toBe(true);
    expect(out.nextWatermarkIso).toBe('2026-04-25T08:00:00.000Z');
  });

  it('ignores own activity after watermark', () => {
    const prev = '2026-04-01T00:00:00.000Z';
    const logs = [{ actor_user_id: 'user-a', created_at: '2026-04-25T08:00:00.000Z' }];
    const out = computeActivityBadgeCatchup(logs, prev, base);
    expect(out.shouldMarkUnread).toBe(false);
    expect(out.nextWatermarkIso).toBe('2026-04-25T08:00:00.000Z');
  });

  it('does not mark unread when that workspace is currently active', () => {
    const prev = '2026-04-01T00:00:00.000Z';
    const logs = [{ actor_user_id: 'user-b', created_at: '2026-04-25T08:00:00.000Z' }];
    const out = computeActivityBadgeCatchup(logs, prev, {
      ...base,
      activeWorkspaceId: 'ws-1',
    });
    expect(out.shouldMarkUnread).toBe(false);
    expect(out.nextWatermarkIso).toBe('2026-04-25T08:00:00.000Z');
  });

  it('returns no watermark update when log list is empty', () => {
    const out = computeActivityBadgeCatchup([], '2026-04-01T00:00:00.000Z', base);
    expect(out.shouldMarkUnread).toBe(false);
    expect(out.nextWatermarkIso).toBeNull();
  });
});
