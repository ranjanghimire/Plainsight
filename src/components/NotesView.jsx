import { useState, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useSearch } from '../hooks/useSearch';
import { NoteCard } from './NoteCard';
import { CategoryDropdown } from './CategoryDropdown';

export function NotesView({ searchQuery }) {
  const {
    data,
    addNote,
    updateNote,
    deleteNote,
    addCategory,
  } = useWorkspace();

  const [categoryFilter, setCategoryFilter] = useState(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [showInlineAddCategory, setShowInlineAddCategory] = useState(false);
  const [inlineNewCategoryName, setInlineNewCategoryName] = useState('');
  const notes = data.notes || [];
  const categories = data.categories || [];
  const filteredBySearch = useSearch(notes, searchQuery);
  const filteredNotes = useMemo(() => {
    if (!categoryFilter) return filteredBySearch;
    return filteredBySearch.filter((n) => n.category === categoryFilter);
  }, [filteredBySearch, categoryFilter]);

  const handleNewNoteSubmit = (e) => {
    e?.preventDefault();
    const text = newNoteText.trim();
    if (!text) return;
    addNote(text, categoryFilter);
    setNewNoteText('');
  };

  const handleInlineAddCategory = () => {
    const name = inlineNewCategoryName.trim();
    if (!name) return;
    addCategory(name);
    setCategoryFilter(name);
    setInlineNewCategoryName('');
    setShowInlineAddCategory(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleNewNoteSubmit}>
        <input
          type="text"
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder="New note…"
          className="w-full px-4 py-2.5 rounded-lg border border-stone-200 bg-white text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:border-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:placeholder-stone-500 dark:focus:ring-stone-600"
          aria-label="New note"
        />
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={`px-2.5 py-1 rounded-md text-sm ${categoryFilter === null ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-200' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600'}`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`px-2.5 py-1 rounded-md text-sm ${categoryFilter === cat ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-200' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600'}`}
          >
            {cat}
          </button>
        ))}
        {showInlineAddCategory ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="text"
              value={inlineNewCategoryName}
              onChange={(e) => setInlineNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInlineAddCategory();
                if (e.key === 'Escape') setShowInlineAddCategory(false);
              }}
              placeholder="New category"
              className="w-28 px-2 py-1 text-sm rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              autoFocus
            />
            <button
              type="button"
              onClick={handleInlineAddCategory}
              className="px-2 py-1 text-sm rounded-md bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-600 dark:text-stone-200"
            >
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowInlineAddCategory(true)}
            className="px-2.5 py-1 rounded-md text-sm bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-400 dark:hover:bg-stone-600"
          >
            + Add category
          </button>
        )}
      </div>

      <div className="grid gap-3">
        {filteredNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            categories={categories}
            onUpdate={updateNote}
            onDelete={deleteNote}
            onAddCategory={addCategory}
            defaultCategory={categoryFilter}
          />
        ))}
      </div>

      {filteredNotes.length === 0 && (
        <p className="text-stone-500 dark:text-stone-400 text-sm py-4">
          {notes.length === 0 ? 'No notes yet. Add one above.' : 'No notes match your search or filter.'}
        </p>
      )}
    </div>
  );
}
