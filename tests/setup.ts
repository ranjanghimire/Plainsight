import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, vi } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var __PS_TEST_FLAGS__: { paidSync: boolean; sessionUserId: string | null } | undefined;
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
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  vi.clearAllMocks();
  globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
});
