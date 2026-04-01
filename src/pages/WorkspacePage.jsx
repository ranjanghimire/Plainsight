import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';
import { getWorkspaceKey, loadAppState, isKeyInVisibleWorkspacesList } from '../utils/storage';

export function WorkspacePage() {
  const { workspace } = useParams();
  const navigate = useNavigate();
  const { load, hydrationComplete } = useWorkspace();

  useEffect(() => {
    if (!hydrationComplete || !workspace) return;
    const key = getWorkspaceKey(workspace);
    const app = loadAppState();
    if (!isKeyInVisibleWorkspacesList(key, app.visibleWorkspaces)) {
      navigate('/', { replace: true });
      return;
    }
    load(workspace);
  }, [workspace, load, hydrationComplete, navigate]);

  return (
    <div className="space-y-4">
      <NotesView />
    </div>
  );
}
