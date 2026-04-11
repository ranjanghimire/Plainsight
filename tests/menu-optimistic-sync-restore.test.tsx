/**
 * Menu optimistic sync restore: while `authReady` is false, avoid flashing "Checking sign-in…"
 * when we have a persisted last-known paid hint or remote-sync flag (see syncEnabled + MenuPanel).
 */

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionUser } from '../src/auth/fetchSessionUser';
import { MenuPanel } from '../src/components/MenuPanel';
import { AuthProvider } from '../src/context/AuthContext';
import { SyncEntitlementProvider } from '../src/context/SyncEntitlementContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import {
  clearPlainsightStorage,
  configureFreeUserTestMode,
  seedFreshHomeWorkspace,
} from './categoryTestHarness';
import { resetSyncQueueForTests } from '../src/sync/syncHelpers';
import {
  getOptimisticLastKnownSyncEntitledForMenu,
  persistLastKnownSyncEntitledForMenu,
  setSyncEntitlementActive,
} from '../src/sync/syncEnabled';

const REMOTE_KEY = 'plainsight_sync_remote_active';
const LAST_KNOWN_KEY = 'plainsight_last_known_sync_entitled';

function writeOtpLikeSession() {
  localStorage.setItem('plainsight_local_user_id', 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee');
  localStorage.setItem('plainsight_local_session_token', 'vitest-otp-session-token');
}

function renderMenuDrawerOpen() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <MenuPanel open onClose={() => {}} />
            </MemoryRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('getOptimisticLastKnownSyncEntitledForMenu', () => {
  beforeEach(() => {
    clearPlainsightStorage();
  });

  it('returns null when no explicit hint and remote sync flag is off', () => {
    expect(getOptimisticLastKnownSyncEntitledForMenu()).toBe(null);
  });

  it('returns true when explicit key is 1', () => {
    localStorage.setItem(LAST_KNOWN_KEY, '1');
    expect(getOptimisticLastKnownSyncEntitledForMenu()).toBe(true);
  });

  it('returns false when explicit key is 0', () => {
    localStorage.setItem(LAST_KNOWN_KEY, '0');
    expect(getOptimisticLastKnownSyncEntitledForMenu()).toBe(false);
  });

  it('returns true when remote sync was persisted on (no explicit key)', () => {
    localStorage.setItem(REMOTE_KEY, '1');
    expect(getOptimisticLastKnownSyncEntitledForMenu()).toBe(true);
  });

  it('clears explicit hint when persistLastKnownSyncEntitledForMenu(null)', () => {
    localStorage.setItem(LAST_KNOWN_KEY, '1');
    persistLastKnownSyncEntitledForMenu(null);
    expect(localStorage.getItem(LAST_KNOWN_KEY)).toBe(null);
  });

  it('persists 1/0 when setSyncEntitlementActive toggles', () => {
    setSyncEntitlementActive(true);
    expect(localStorage.getItem(LAST_KNOWN_KEY)).toBe('1');
    setSyncEntitlementActive(false);
    expect(localStorage.getItem(LAST_KNOWN_KEY)).toBe('0');
  });
});

describe('MenuPanel — optimistic copy while session restore is pending', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPlainsightStorage();
    configureFreeUserTestMode();
    seedFreshHomeWorkspace();
    globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
    vi.mocked(fetchSessionUser).mockImplementation(
      () => new Promise(() => {
        /* never resolves — keeps authReady false */
      }),
    );
  });

  afterEach(() => {
    cleanup();
    resetSyncQueueForTests();
    vi.mocked(fetchSessionUser).mockReset();
    globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
  });

  it('shows Checking sign-in when there is no optimistic hint', async () => {
    writeOtpLikeSession();
    renderMenuDrawerOpen();
    await screen.findByTestId('menu-panel');
    expect(screen.getByText(/checking sign-in/i)).toBeInTheDocument();
  });

  it('does not show Checking when last-known paid hint is stored', async () => {
    writeOtpLikeSession();
    localStorage.setItem(LAST_KNOWN_KEY, '1');
    renderMenuDrawerOpen();
    await screen.findByTestId('menu-panel');
    await waitFor(() => {
      expect(screen.queryByText(/checking sign-in/i)).not.toBeInTheDocument();
    });
    const followUp =
      screen.queryByText(/confirming your subscription/i) ||
      screen.queryByRole('button', { name: /unlock cloud sync/i });
    expect(followUp).toBeTruthy();
  });

  it('does not show Checking when persisted cloud sync implies returning paid user', async () => {
    writeOtpLikeSession();
    localStorage.setItem(REMOTE_KEY, '1');
    renderMenuDrawerOpen();
    await screen.findByTestId('menu-panel');
    await waitFor(() => {
      expect(screen.queryByText(/checking sign-in/i)).not.toBeInTheDocument();
    });
  });
});
