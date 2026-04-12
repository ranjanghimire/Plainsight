import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';
import { useSyncEntitlement } from '../context/SyncEntitlementContext';
import {
  getWorkspaceKey,
  loadAppState,
  isKeyInVisibleWorkspacesList,
  isLegacyHiddenWorkspaceKey,
} from '../utils/storage';

export function WorkspacePage() {
  const { workspace } = useParams();
  const navigate = useNavigate();
  const { load, hydrationComplete, peekHiddenWorkspaceCreationAllowed } = useWorkspace();
  const { showToast } = useSyncEntitlement();
  const routeLoadEpochRef = useRef(0);
  const hiddenQuotaWarnedForRef = useRef(null);

  useEffect(() => {
    if (!workspace) return undefined;
    const key = getWorkspaceKey(workspace);
    const app = loadAppState();
    const inMenu = isKeyInVisibleWorkspacesList(key, app.visibleWorkspaces);
    const legacyHidden = isLegacyHiddenWorkspaceKey(key);
    if (!inMenu && !legacyHidden) {
      if (hydrationComplete) navigate('/', { replace: true });
      return undefined;
    }
    if (!peekHiddenWorkspaceCreationAllowed(workspace)) {
      if (hiddenQuotaWarnedForRef.current !== workspace) {
        hiddenQuotaWarnedForRef.current = workspace;
        showToast('Free plan allows one hidden workspace. Upgrade to cloud sync for more.', {
          persistent: true,
          showUpgradeCta: true,
        });
      }
      if (hydrationComplete) navigate('/', { replace: true });
      return undefined;
    }
    hiddenQuotaWarnedForRef.current = null;
    // Menu-visible workspaces (e.g. home) wait for hydration so restore does not overwrite.
    // Legacy hidden keys from /manage are not in the menu list; load immediately to avoid stale notes.
    if (!hydrationComplete && !legacyHidden) return undefined;
    const epoch = ++routeLoadEpochRef.current;
    load(workspace, 'hidden', {
      isCancelled: () => routeLoadEpochRef.current !== epoch,
    });
    return () => {
      routeLoadEpochRef.current += 1;
    };
  }, [
    workspace,
    load,
    hydrationComplete,
    navigate,
    peekHiddenWorkspaceCreationAllowed,
    showToast,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NotesView />
    </div>
  );
}
