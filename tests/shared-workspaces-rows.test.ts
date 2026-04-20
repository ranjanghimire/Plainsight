import { afterEach, describe, expect, it } from 'vitest';
import { setSession, clearSession } from '../src/auth/localSession';
import { persistAuthDisplayEmail, clearAuthDisplayEmailStorage } from '../src/auth/authDisplayEmail';
import { buildSharedWorkspaceRows } from '../src/sync/sharedWorkspaces';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const COLLAB_ID = '22222222-2222-4222-8222-222222222222';

function resetIdentity() {
  clearSession();
  clearAuthDisplayEmailStorage();
}

describe('buildSharedWorkspaceRows', () => {
  afterEach(() => {
    resetIdentity();
  });

  it('does not list the owner’s workspace under Shared Workspaces (it stays under WORKSPACES only)', () => {
    setSession('session-owner', OWNER_ID);
    persistAuthDisplayEmail('owner@plainsight.test');

    const res = buildSharedWorkspaceRows({
      shares: [
        {
          id: 'share-1',
          workspace_id: 'ws-1',
          owner_id: OWNER_ID,
          recipient_email: 'friend@example.com',
          recipient_user_id: COLLAB_ID,
          workspace_name: 'Team Notes',
          owner_email: 'owner@plainsight.test',
          status: 'accepted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
          revoked_at: null,
        },
      ],
    });

    expect(res.pendingRows).toHaveLength(0);
    expect(res.acceptedRows).toHaveLength(0);
  });

  it('includes collaborator accepted share in shared rows', () => {
    setSession('session-collab', COLLAB_ID);
    persistAuthDisplayEmail('collab@example.com');

    const res = buildSharedWorkspaceRows({
      shares: [
        {
          id: 'share-1',
          workspace_id: 'ws-1',
          owner_id: OWNER_ID,
          recipient_email: 'collab@example.com',
          recipient_user_id: COLLAB_ID,
          workspace_name: 'Team Notes',
          owner_email: 'owner@plainsight.test',
          status: 'accepted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
          revoked_at: null,
        },
      ],
    });

    expect(res.pendingRows).toHaveLength(0);
    expect(res.acceptedRows).toHaveLength(1);
    expect(res.acceptedRows[0].workspaceId).toBe('ws-1');
    expect(res.acceptedRows[0].isOwner).toBe(false);
  });

  it('includes pending invite when recipient matches current email', () => {
    setSession('session-collab', COLLAB_ID);
    persistAuthDisplayEmail('collab@example.com');

    const res = buildSharedWorkspaceRows({
      shares: [
        {
          id: 'share-pending',
          workspace_id: 'ws-2',
          owner_id: OWNER_ID,
          recipient_email: 'collab@example.com',
          recipient_user_id: null,
          workspace_name: 'Roadmap',
          owner_email: 'owner@plainsight.test',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ],
    });

    expect(res.acceptedRows).toHaveLength(0);
    expect(res.pendingRows).toHaveLength(1);
    expect(res.pendingRows[0].workspaceId).toBe('ws-2');
    expect(res.pendingRows[0].recipientEmail).toBe('collab@example.com');
  });
});
