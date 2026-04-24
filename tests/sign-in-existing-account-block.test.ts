import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as syncEnabled from '../src/sync/syncEnabled';
import * as localSession from '../src/auth/localSession';
import * as presence from '../src/utils/localWorkspaceDataPresence';
import { shouldBlockExistingAccountSignIn } from '../src/utils/signInExistingAccountBlock';

describe('shouldBlockExistingAccountSignIn', () => {
  beforeEach(() => {
    vi.spyOn(syncEnabled, 'hasCustomAuthSession').mockReturnValue(false);
    vi.spyOn(presence, 'localWorkspaceHasMeaningfulData').mockReturnValue(true);
    vi.spyOn(localSession, 'getSession').mockReturnValue({
      userId: '00000000-0000-4000-8000-000000000002',
      sessionToken: 'guest',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when user already has a custom auth session', () => {
    vi.mocked(syncEnabled.hasCustomAuthSession).mockReturnValue(true);
    expect(shouldBlockExistingAccountSignIn()).toBe(false);
  });

  it('returns false for Phase-1 local dev placeholder session', () => {
    vi.spyOn(localSession, 'getSession').mockReturnValue({
      userId: localSession.LOCAL_DEV_USER_ID,
      sessionToken: localSession.LOCAL_DEV_SESSION_TOKEN,
    });
    expect(shouldBlockExistingAccountSignIn()).toBe(false);
  });

  it('returns false when there is no meaningful local workspace data', () => {
    vi.spyOn(localSession, 'getSession').mockReturnValue({
      userId: '00000000-0000-4000-8000-000000000002',
      sessionToken: 'guest',
    });
    vi.mocked(presence.localWorkspaceHasMeaningfulData).mockReturnValue(false);
    expect(shouldBlockExistingAccountSignIn()).toBe(false);
  });

  it('returns true for non-dev session with meaningful local data', () => {
    expect(shouldBlockExistingAccountSignIn()).toBe(true);
  });
});
