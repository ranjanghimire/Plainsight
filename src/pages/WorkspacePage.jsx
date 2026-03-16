import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SearchCommandBar } from '../components/SearchCommandBar';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';
import { useState } from 'react';

export function WorkspacePage() {
  const { workspace } = useParams();
  const { load } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (workspace) load(workspace);
  }, [workspace, load]);

  return (
    <div className="space-y-4">
      <SearchCommandBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <NotesView searchQuery={searchQuery} />
    </div>
  );
}
