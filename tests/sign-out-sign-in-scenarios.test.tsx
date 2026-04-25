/**
 * Sign-out / sign-in flows: empty local vs remote, new vs existing account, and sign-out then sign-in again.
 */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SendCodeModal } from '../src/components/SendCodeModal';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { setSession, ensureLocalSession, LOCAL_DEV_USER_ID } from '../src/auth/localSession';
import { saveWorkspace } from '../src/utils/storage';
import { clearPlainsightStorage, seedFreshHomeWorkspace } from './categoryTestHarness';
import * as sendCodeModule from '../src/auth/sendCode';
import * as clearAllClientStateModule from '../src/utils/clearAllLocalClientState';

vi.mock('../src/auth/sendCode', () => ({
  sendCode: vi.fn(),
}));

vi.mock('../src/auth/checkSyncEntitlementRemote', () => ({
  checkSyncEntitlementRemote: vi.fn(async () => null),
}));

/** Phase-1 dev user id + non-default token → not treated as full local-dev session; unsynced local data can gate existing-account sign-in. */
function seedGuestWithUnsyncedNotesOnDevice() {
  clearPlainsightStorage();
  seedFreshHomeWorkspace();
  setSession('guest-offline-token', LOCAL_DEV_USER_ID);
  saveWorkspace('workspace_home', {
    notes: [{ id: 'n-local-1', text: 'Only on device', category: null }],
    categories: [],
    archivedNotes: {},
  });
}

function seedEmptyLocalDevice() {
  clearPlainsightStorage();
  seedFreshHomeWorkspace();
  ensureLocalSession();
}

function SignOutProbe() {
  const { signOut } = useAuth();
  return (
    <button type="button" aria-label="Run test sign out" onClick={() => void signOut()}>
      Test sign out
    </button>
  );
}

describe('sign out and sign in scenarios', () => {
  beforeEach(() => {
    vi.mocked(sendCodeModule.sendCode).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearPlainsightStorage();
  });

  it('Test 1: no local notes — sign in to an existing cloud account reaches the code step (remote can restore)', async () => {
    seedEmptyLocalDevice();
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      accountExists: true,
    });
    const user = userEvent.setup();
    render(
      <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'cloud-user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /already exists in the cloud/i })).not.toBeInTheDocument();
  });

  it('Test 2: local notes — sign in with a new account (accountExists false) reaches the code step', async () => {
    seedGuestWithUnsyncedNotesOnDevice();
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: true,
      userId: 'bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee',
      accountExists: false,
    });
    const user = userEvent.setup();
    render(
      <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'brand-new@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /already exists in the cloud/i })).not.toBeInTheDocument();
  });

  it('Test 3: local notes — sign in with an existing account is blocked until device is cleared', async () => {
    seedGuestWithUnsyncedNotesOnDevice();
    vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      accountExists: true,
    });
    const user = userEvent.setup();
    render(
      <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    await user.type(screen.getByPlaceholderText('you@example.com'), 'existing@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /already exists in the cloud/i })).toBeInTheDocument();
    });
  });

  it('Test 4: sign out wipes device and navigates home; after wipe, signing into an existing account reaches the code step', async () => {
    const assign = vi.fn();
    const prev = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { ...prev, assign };

    try {
      clearPlainsightStorage();
      seedFreshHomeWorkspace();
      setSession('vitest-otp-session-token', 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee');
      saveWorkspace('workspace_home', {
        notes: [{ id: 'n1', text: 'Synced before', category: null }],
        categories: [],
        archivedNotes: {},
      });
      localStorage.setItem('plainsight_sync_remote_active', '1');

      const clearSpy = vi.spyOn(clearAllClientStateModule, 'clearAllLocalClientState');

      const user = userEvent.setup();
      render(
        <AuthProvider>
          <SignOutProbe />
        </AuthProvider>,
      );

      await user.click(screen.getByRole('button', { name: /Run test sign out/i }));
      await waitFor(() => {
        expect(clearSpy).toHaveBeenCalledWith('logout');
        expect(assign).toHaveBeenCalledWith('/');
      });

      clearSpy.mockRestore();
      cleanup();

      // Simulate post–sign-out device: wipe already ran (real implementation via spy).
      expect(localStorage.getItem('workspace_home')).toBeNull();

      vi.mocked(sendCodeModule.sendCode).mockResolvedValue({
        ok: true,
        userId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
        accountExists: true,
      });

      seedFreshHomeWorkspace();
      ensureLocalSession();

      render(
        <SendCodeModal open onClose={() => {}} loginWithCode={vi.fn().mockResolvedValue({ ok: true })} />,
      );
      await user.type(screen.getByPlaceholderText('you@example.com'), 'returning@example.com');
      await user.click(screen.getByRole('button', { name: 'Send code' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
      });
      expect(screen.queryByRole('heading', { name: /already exists in the cloud/i })).not.toBeInTheDocument();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).location;
      window.location = prev;
    }
  });
});
