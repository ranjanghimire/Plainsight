import { useEffect } from 'react';
import { SearchCommandBar } from '../components/SearchCommandBar';
import { NotesView } from '../components/NotesView';
import { useWorkspace } from '../context/WorkspaceContext';
import { useState } from 'react';

export function HomePage() {
  const { load } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    load('home');
  }, [load]);

  return (
    <div className="space-y-4">
      <SearchCommandBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <NotesView searchQuery={searchQuery} />
    </div>
  );
}
