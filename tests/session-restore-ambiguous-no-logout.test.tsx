import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionUser } from '../src/auth/fetchSessionUser';
import * as localSession from '../src/auth/localSession';
import { AuthProvider } from '../src/context/AuthContext';
import { clearPlainsightStorage } from './categoryTestHarness';

describe('Auth session restore — ambiguous loggedIn:false', () => {
  beforeEach(() => {
    clearPlainsightStorage();
    globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
    vi.mocked(fetchSessionUser).mockResolvedValue({ loggedIn: false });
    localStorage.setItem('plainsight_local_user_id', '77777777-7777-4777-8777-777777777777');
    localStorage.setItem('plainsight_local_session_token', 'opaque-test-session');
    localStorage.setItem('plainsight_auth_display_email', 'keep@example.com');
  });

  afterEach(() => {
    vi.mocked(fetchSessionUser).mockReset();
    globalThis.__PS_TEST_FLAGS__ = { paidSync: false, sessionUserId: null };
  });

  it('does not clear local OTP session (avoids false sign-out + sign-in deadlock on flaky PWA)', async () => {
    const clearSpy = vi.spyOn(localSession, 'clearSession');
    render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    );
    await waitFor(() => {
      expect(vi.mocked(fetchSessionUser)).toHaveBeenCalled();
    });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('plainsight_local_user_id')).toBe('77777777-7777-4777-8777-777777777777');
    expect(localStorage.getItem('plainsight_local_session_token')).toBe('opaque-test-session');
    clearSpy.mockRestore();
  });
});
