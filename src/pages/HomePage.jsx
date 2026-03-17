import { useEffect } from 'react';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';

export function HomePage() {
  const { load } = useWorkspace();

  useEffect(() => {
    load('home');
  }, [load]);

  return (
    <div className="space-y-4">
      <NotesView />
    </div>
  );
}
