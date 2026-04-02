import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  getWorkspaceKey,
  loadAppState,
  isKeyInVisibleWorkspacesList,
  isLegacyHiddenWorkspaceKey,
} from '../utils/storage';

export function WorkspacePage() {
  const { workspace } = useParams();
  const navigate = useNavigate();
  const { load, hydrationComplete } = useWorkspace();
  const routeLoadEpochRef = useRef(0);

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
  }, [workspace, load, hydrationComplete, navigate]);

  return (
    <div className="space-y-4">
      <NotesView />
    </div>
  );
}
