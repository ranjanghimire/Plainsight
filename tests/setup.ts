import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import { getSession as getLocalSession } from '../src/auth/localSession';
import { readAuthDisplayEmail } from '../src/auth/authDisplayEmail';

declare global {
  // eslint-disable-next-line no-var
  var __PS_TEST_FLAGS__:
    | {
        paidSync: boolean;
        sessionUserId: string | null;
        useRealSharedWorkspaces?: boolean;
      }
    | undefined;
}

globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };

// Some Vitest transforms resolve JSX to `React.createElement` without importing React; mirror a browser global for app modules.
(globalThis as unknown as { React: typeof React }).React = React;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: String(query).includes('pointer: fine'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

vi.mock('@revenuecat/purchases-js', () => {
  const makePurchases = () => ({
    getCustomerInfo: vi.fn(async () => {
      const sync = !!globalThis.__PS_TEST_FLAGS__?.paidSync;
      return {
        entitlements: {
          active: sync
            ? { sync: { identifier: 'sync', isActive: true } }
            : {},
          all: sync
            ? { sync: { identifier: 'sync', isActive: true } }
            : {},
        },
      };
    }),
    getOfferings: vi.fn(async () => ({ current: null })),
    identifyUser: vi.fn(async () => ({
      entitlements: {
        active: globalThis.__PS_TEST_FLAGS__?.paidSync
          ? { sync: { identifier: 'sync', isActive: true } }
          : {},
        all: globalThis.__PS_TEST_FLAGS__?.paidSync
          ? { sync: { identifier: 'sync', isActive: true } }
          : {},
      },
    })),
    changeUser: vi.fn(async () => ({
      entitlements: { active: {}, all: {} },
    })),
    isAnonymous: vi.fn(() => true),
    isEntitledTo: vi.fn(async () => !!globalThis.__PS_TEST_FLAGS__?.paidSync),
    purchase: vi.fn(),
  });

  return {
    Purchases: {
      configure: vi.fn(() => makePurchases()),
      generateRevenueCatAnonymousAppUserId: vi.fn(() => 'rc-test-anon-id'),
    },
    ErrorCode: { UserCancelledError: 'USER_CANCELLED' },
    PackageType: { Lifetime: 'LIFETIME' },
  };
});

vi.mock('../src/auth/fetchSessionUser', () => ({
  fetchSessionUser: vi.fn(async () => {
    const uid = globalThis.__PS_TEST_FLAGS__?.sessionUserId?.trim();
    if (uid) {
      return {
        loggedIn: true,
        userId: uid,
        email: 'vitest@plainsight.test',
      };
    }
    return { loggedIn: false };
  }),
}));

vi.mock('../src/auth/checkSyncEntitlementRemote', () => ({
  checkSyncEntitlementRemote: vi.fn(async (uid: string | undefined) => {
    if (globalThis.__PS_TEST_FLAGS__?.paidSync && uid?.trim()) return true;
    return false;
  }),
}));

vi.mock('../src/sync/sharedWorkspaces', async () => {
  const actual = await vi.importActual<typeof import('../src/sync/sharedWorkspaces')>(
    '../src/sync/sharedWorkspaces',
  );

  const normalize = (v: unknown) => String(v || '').trim().toLowerCase();

  const listWorkspaceShares = vi.fn(async () => {
    if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
      return actual.listWorkspaceShares();
    }
    const paid = !!globalThis.__PS_TEST_FLAGS__?.paidSync;
    if (!paid) return { data: [] };
    const uid = normalize(getLocalSession().userId);
    const email = normalize(readAuthDisplayEmail() || '');
    const now = new Date().toISOString();
    if (!uid) return { data: [] };
    return {
      data: [
        {
          id: 'share-owner-accepted',
          workspace_id: 'ws-shared-owner',
          owner_id: uid,
          recipient_email: 'friend@example.com',
          recipient_user_id: '33333333-3333-4333-8333-333333333333',
          workspace_name: 'Shared Owner Workspace',
          owner_email: email || 'vitest@plainsight.test',
          status: 'accepted',
          created_at: now,
          updated_at: now,
          accepted_at: now,
          revoked_at: null,
        },
        {
          id: 'share-invite-pending',
          workspace_id: 'ws-shared-invite',
          owner_id: '99999999-9999-4999-8999-999999999999',
          recipient_email: email || 'vitest@plainsight.test',
          recipient_user_id: uid,
          workspace_name: 'Pending Invite Workspace',
          owner_email: 'owner@plainsight.test',
          status: 'pending',
          created_at: now,
          updated_at: now,
          accepted_at: null,
          revoked_at: null,
        },
      ],
    };
  });

  const shareWorkspaceByEmail = vi.fn(
    async (workspaceId: string, workspaceName: string, recipientEmail: string) => {
      if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
        return actual.shareWorkspaceByEmail(workspaceId, workspaceName, recipientEmail);
      }
      return { ok: true };
    },
  );
  const acceptWorkspaceShare = vi.fn(async (shareId: string) => {
    if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
      return actual.acceptWorkspaceShare(shareId);
    }
    return { ok: true };
  });
  const makeWorkspacePrivate = vi.fn(async (workspaceId: string) => {
    if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
      return actual.makeWorkspacePrivate(workspaceId);
    }
    return { ok: true, revokedCount: 1 };
  });
  const fetchWorkspaceActivityLogs = vi.fn(async (workspaceId: string, limit = 60) => {
    if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
      return actual.fetchWorkspaceActivityLogs(workspaceId, limit);
    }
    return {
      data: [
        {
          id: 'log-1',
          workspace_id: workspaceId,
          actor_user_id: normalize(getLocalSession().userId) || 'unknown',
          actor_email: normalize(readAuthDisplayEmail() || '') || 'vitest@plainsight.test',
          action: 'note_updated',
          summary: 'Updated note',
          details: {},
          created_at: new Date().toISOString(),
        },
      ],
    };
  });
  const logWorkspaceActivity = vi.fn(async (workspaceId, action, summary, details) => {
    if (globalThis.__PS_TEST_FLAGS__?.useRealSharedWorkspaces) {
      return actual.logWorkspaceActivity(workspaceId, action, summary, details);
    }
    return { ok: true };
  });

  return {
    ...actual,
    listWorkspaceShares,
    shareWorkspaceByEmail,
    acceptWorkspaceShare,
    makeWorkspacePrivate,
    fetchWorkspaceActivityLogs,
    logWorkspaceActivity,
  };
});

vi.mock('../src/components/ConfirmDialog.jsx', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!open) return null;
    return React.createElement(
      'div',
      { 'data-testid': 'mock-confirm-dialog' },
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'mock-confirm-ok', onClick: onConfirm },
        'OK',
      ),
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'mock-confirm-cancel', onClick: onCancel },
        'Cancel',
      ),
    );
  },
}));

afterEach(() => {
  cleanup();
  resetSyncQueueForTests();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.clearAllMocks();
  globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
});
