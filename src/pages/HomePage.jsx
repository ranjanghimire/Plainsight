import { NotesView } from '../components/NotesView';

export function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NotesView />
    </div>
  );
}
