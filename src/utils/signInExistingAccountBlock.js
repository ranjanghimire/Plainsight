import {
  getSession,
  LOCAL_DEV_SESSION_TOKEN,
  LOCAL_DEV_USER_ID,
} from '../auth/localSession';
import { hasCustomAuthSession } from '../sync/syncEnabled';
import { localWorkspaceHasMeaningfulData } from './localWorkspaceDataPresence';

/**
 * Guest / local placeholder session with real workspace data must not merge into an existing cloud account.
 */
export function shouldBlockExistingAccountSignIn() {
  if (hasCustomAuthSession()) return false;
  const { userId, sessionToken } = getSession();
  if (userId === LOCAL_DEV_USER_ID && sessionToken === LOCAL_DEV_SESSION_TOKEN) return false;
  return localWorkspaceHasMeaningfulData();
}
