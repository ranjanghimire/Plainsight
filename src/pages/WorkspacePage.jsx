import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';

export function WorkspacePage() {
  const { workspace } = useParams();
  const { load } = useWorkspace();

  useEffect(() => {
    if (workspace) load(workspace);
  }, [workspace, load]);

  return (
    <div className="space-y-4">
      <NotesView />
    </div>
  );
}
