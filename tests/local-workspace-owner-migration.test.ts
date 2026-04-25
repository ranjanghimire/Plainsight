import { describe, expect, it } from 'vitest';
import { normalizeLocalWorkspaceOwnerIdsForSession } from '../src/sync/syncEngine';
import { LOCAL_DEV_USER_ID } from '../src/auth/localSession';

describe('normalizeLocalWorkspaceOwnerIdsForSession', () => {
  it('reassigns LOCAL_DEV_USER_ID and empty owner_id rows to the signed-in owner', () => {
    const ownerId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    const now = new Date().toISOString();
    const local = [
      { id: 'w1', owner_id: LOCAL_DEV_USER_ID, name: 'private', kind: 'hidden', created_at: now, updated_at: now },
      { id: 'w2', owner_id: '', name: 'home', kind: 'visible', created_at: now, updated_at: now },
      { id: 'w3', owner_id: ownerId, name: 'keep', kind: 'hidden', created_at: now, updated_at: now },
    ];
    const res = normalizeLocalWorkspaceOwnerIdsForSession(local as any, ownerId);
    expect(res.changed).toBe(true);
    expect(res.next.find((w: any) => w.id === 'w1').owner_id).toBe(ownerId);
    expect(res.next.find((w: any) => w.id === 'w2').owner_id).toBe(ownerId);
    expect(res.next.find((w: any) => w.id === 'w3').owner_id).toBe(ownerId);
  });

  it('is a no-op when ownerId is null/empty', () => {
    const now = new Date().toISOString();
    const local = [
      { id: 'w1', owner_id: LOCAL_DEV_USER_ID, name: 'private', kind: 'hidden', created_at: now, updated_at: now },
    ];
    const res = normalizeLocalWorkspaceOwnerIdsForSession(local as any, null);
    expect(res.changed).toBe(false);
    expect(res.next[0].owner_id).toBe(LOCAL_DEV_USER_ID);
  });
});

