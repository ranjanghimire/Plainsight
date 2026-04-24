import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllLocalClientState,
  collectRemovableLocalStorageKeys,
  CLIENT_LOGOUT_BROADCAST_CHANNEL,
} from '../src/utils/clearAllLocalClientState';
import { getSession, LOCAL_DEV_SESSION_TOKEN, LOCAL_DEV_USER_ID } from '../src/auth/localSession';

describe('clearAllLocalClientState', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('removes plainsight_, workspace_, ws_visible_, and masterKey but keeps plainsight-theme', async () => {
    localStorage.setItem('plainsight-theme', 'dark');
    localStorage.setItem('plainsight_app_state', '{}');
    localStorage.setItem('workspace_home', '{"notes":[],"categories":[],"archivedNotes":{}}');
    localStorage.setItem('plainsight_local_user_id', 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee');
    localStorage.setItem('plainsight_local_session_token', 'otp-token');
    localStorage.setItem('masterKey', 'secret');

    await clearAllLocalClientState('logout');

    expect(localStorage.getItem('plainsight-theme')).toBe('dark');
    expect(localStorage.getItem('plainsight_app_state')).toBeNull();
    expect(localStorage.getItem('workspace_home')).toBeNull();
    expect(localStorage.getItem('masterKey')).toBeNull();
    const s = getSession();
    expect(s.userId).toBe(LOCAL_DEV_USER_ID);
    expect(s.sessionToken).toBe(LOCAL_DEV_SESSION_TOKEN);
  });

  it('posts a logout message on the broadcast channel', async () => {
    const postMessage = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(() => {});
    const close = vi.spyOn(BroadcastChannel.prototype, 'close').mockImplementation(() => {});

    await clearAllLocalClientState('logout');

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLEAR', reason: 'logout' }),
    );
    expect(close).toHaveBeenCalled();
  });

  it('collectRemovableLocalStorageKeys lists removable keys and excludes theme', () => {
    localStorage.setItem('plainsight-theme', 'light');
    localStorage.setItem('plainsight_foo', '1');
    localStorage.setItem('workspace_x', '{}');
    localStorage.setItem('other', 'keep');
    const keys = collectRemovableLocalStorageKeys();
    expect(keys).toContain('plainsight_foo');
    expect(keys).toContain('workspace_x');
    expect(keys).not.toContain('plainsight-theme');
    expect(keys).not.toContain('other');
  });
});

describe('CLIENT_LOGOUT_BROADCAST_CHANNEL', () => {
  it('uses a stable channel name', () => {
    expect(CLIENT_LOGOUT_BROADCAST_CHANNEL).toBe('plainsight-client-logout');
  });
});
