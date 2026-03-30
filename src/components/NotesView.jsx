import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useArchiveMode } from '../context/ArchiveModeContext';
import { useSearch } from '../hooks/useSearch';
import { NoteCard } from './NoteCard';
import { SearchCommandBar } from './SearchCommandBar';
import { CategoryChips } from './CategoryChips';
import { NoteList } from './NoteList';
import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';

function noteHasNoCategory(n) {
  return n.category == null || n.category === '';
}

function archivedEntryMatchesCategory(entry, categoryFilter) {
  if (!categoryFilter) return true;
  if (categoryFilter === UNCATEGORIZED_FILTER) {
    return entry.category == null || entry.category === '';
  }
  return entry.category === categoryFilter;
}

function resolveRestoreCategory(categoryFilter, categories, entryCategory) {
  if (categoryFilter === UNCATEGORIZED_FILTER) return null;
  if (
    categoryFilter &&
    categoryFilter !== UNCATEGORIZED_FILTER &&
    categories.includes(categoryFilter)
  ) {
    return categoryFilter;
  }
  if (entryCategory && categories.includes(entryCategory)) return entryCategory;
  return null;
}

export function NotesView() {
  const {
    data,
    addNote,
    updateNote,
    deleteNote,
    addCategory,
    restoreArchivedNote,
    updateArchivedNote,
    permanentlyDeleteArchived,
    removeArchivedByTextKeys,
    workspaceSwitchGeneration,
  } = useWorkspace();

  const { archiveMode } = useArchiveMode();

  const [inputValue, setInputValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showInlineAddCategory, setShowInlineAddCategory] = useState(false);
  const [inlineNewCategoryName, setInlineNewCategoryName] = useState('');
  const [restoringKeys, setRestoringKeys] = useState({});
  const notes = useMemo(() => data.notes || [], [data.notes]);
  const categories = useMemo(() => data.categories || [], [data.categories]);
  const archivedNotesMap = useMemo(
    () => data.archivedNotes || {},
    [data.archivedNotes],
  );

  const hasUncategorizedNotes = useMemo(() => {
    if (notes.some(noteHasNoCategory)) return true;
    return Object.values(archivedNotesMap).some(
      (e) => e.category == null || e.category === '',
    );
  }, [notes, archivedNotesMap]);

  useEffect(() => {
    if (
      categoryFilter === UNCATEGORIZED_FILTER &&
      !hasUncategorizedNotes
    ) {
      const t = window.setTimeout(() => setCategoryFilter(null), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [categoryFilter, hasUncategorizedNotes]);

  const filteredBySearch = useSearch(notes, inputValue);
  const filteredNotes = useMemo(() => {
    if (!categoryFilter) return filteredBySearch;
    if (categoryFilter === UNCATEGORIZED_FILTER) {
      return filteredBySearch.filter(noteHasNoCategory);
    }
    return filteredBySearch.filter((n) => n.category === categoryFilter);
  }, [filteredBySearch, categoryFilter]);

  const archivedForView = useMemo(() => {
    return Object.values(archivedNotesMap).filter((e) =>
      archivedEntryMatchesCategory(e, categoryFilter),
    );
  }, [archivedNotesMap, categoryFilter]);

  const archivedBySearch = useMemo(() => {
    if (!inputValue.trim()) return archivedForView;
    const q = inputValue.trim().toLowerCase();
    return archivedForView.filter((e) =>
      (e.text || '').toLowerCase().includes(q),
    );
  }, [archivedForView, inputValue]);

  const archivedSorted = useMemo(
    () =>
      [...archivedBySearch].sort(
        (a, b) => b.lastDeletedAt - a.lastDeletedAt,
      ),
    [archivedBySearch],
  );

  const handleCreateNote = (text) => {
    if (!text?.trim()) return;
    const cat =
      categoryFilter === UNCATEGORIZED_FILTER ? null : categoryFilter;
    addNote(text.trim(), cat);
  };

  const handleInlineAddCategory = () => {
    const name = inlineNewCategoryName.trim();
    if (!name) return;
    addCategory(name);
    setCategoryFilter(name);
    setInlineNewCategoryName('');
    setShowInlineAddCategory(false);
  };

  const [archiveClearKeys, setArchiveClearKeys] = useState(null);

  const openArchiveClearConfirm = useCallback(() => {
    const keys = archivedSorted.map((e) => e.text);
    if (keys.length === 0) return;
    setArchiveClearKeys(keys);
  }, [archivedSorted]);

  const confirmArchiveClear = useCallback(() => {
    if (archiveClearKeys?.length) {
      removeArchivedByTextKeys(archiveClearKeys);
    }
    setArchiveClearKeys(null);
  }, [archiveClearKeys, removeArchivedByTextKeys]);

  const cancelArchiveClear = useCallback(() => {
    setArchiveClearKeys(null);
  }, []);

  useEffect(() => {
    if (!archiveClearKeys) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setArchiveClearKeys(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [archiveClearKeys]);

  const handleRestoreArchived = useCallback(
    (textKey) => {
      const entry = archivedNotesMap[textKey];
      const resolved = resolveRestoreCategory(
        categoryFilter,
        categories,
        entry?.category,
      );
      setRestoringKeys((r) => ({ ...r, [textKey]: true }));
      window.setTimeout(() => {
        restoreArchivedNote(textKey, resolved);
        setRestoringKeys((r) => {
          const next = { ...r };
          delete next[textKey];
          return next;
        });
      }, 200);
    },
    [
      archivedNotesMap,
      categoryFilter,
      categories,
      restoreArchivedNote,
    ],
  );

  const archiveSubtitle =
    categoryFilter == null
      ? 'Archived items (All categories)'
      : `Archived items for ${
          categoryFilter === UNCATEGORIZED_FILTER
            ? 'Undefined'
            : categoryFilter
        }`;

  const [archiveFadeOpacity, setArchiveFadeOpacity] = useState(1);
  const archiveFadeSkipFirst = useRef(true);
  useEffect(() => {
    if (archiveFadeSkipFirst.current) {
      archiveFadeSkipFirst.current = false;
      return undefined;
    }
    const t1 = window.setTimeout(() => setArchiveFadeOpacity(0.92), 0);
    const t2 = window.setTimeout(() => setArchiveFadeOpacity(1), 180);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [archiveMode]);

  useEffect(() => {
    const t = window.setTimeout(() => setCategoryFilter(null), 0);
    return () => window.clearTimeout(t);
  }, [workspaceSwitchGeneration]);

  const [wsFadeOpacity, setWsFadeOpacity] = useState(1);
  useEffect(() => {
    if (workspaceSwitchGeneration === 0) return undefined;
    const t1 = window.setTimeout(() => setWsFadeOpacity(0.88), 0);
    const t2 = window.setTimeout(() => setWsFadeOpacity(1), 170);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [workspaceSwitchGeneration]);

  return (
    <div className="space-y-4">
      <SearchCommandBar
        value={inputValue}
        onChange={setInputValue}
        onCreateNote={handleCreateNote}
      />

      <CategoryChips
        categories={categories}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        hasUncategorizedNotes={hasUncategorizedNotes}
        showInlineAddCategory={showInlineAddCategory}
        setShowInlineAddCategory={setShowInlineAddCategory}
        inlineNewCategoryName={inlineNewCategoryName}
        setInlineNewCategoryName={setInlineNewCategoryName}
        handleInlineAddCategory={handleInlineAddCategory}
      />

      <div
        className="transition-opacity duration-200 ease-out"
        style={{ opacity: archiveFadeOpacity * wsFadeOpacity }}
      >
        {archiveMode ? (
          <NoteList
            archiveMode
            subtitle={archiveSubtitle}
            onArchiveClearAll={
              archivedSorted.length > 0 ? openArchiveClearConfirm : undefined
            }
            isEmpty={archivedSorted.length === 0}
            emptyText="No archived items for this category"
          >
            {archivedSorted.map((entry) => (
              <NoteCard
                key={`arch:${entry.text}`}
                note={{
                  id: `arch:${entry.text}`,
                  text: entry.text,
                  category: entry.category ?? null,
                  createdAt: null,
                  lastDeletedAt: entry.lastDeletedAt,
                }}
                categories={categories}
                onUpdate={updateNote}
                onDelete={deleteNote}
                onAddCategory={addCategory}
                variant="archived"
                onRestore={handleRestoreArchived}
                onArchivedUpdate={updateArchivedNote}
                onPermanentDeleteArchived={permanentlyDeleteArchived}
                archiveAnimating={!!restoringKeys[entry.text]}
              />
            ))}
          </NoteList>
        ) : (
          <NoteList
            archiveMode={false}
            subtitle={null}
            isEmpty={filteredNotes.length === 0}
            emptyText={
              notes.length === 0
                ? 'No notes yet. Add one above.'
                : 'No notes match your search or filter.'
            }
          >
            {filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                categories={categories}
                onUpdate={updateNote}
                onDelete={deleteNote}
                onAddCategory={addCategory}
              />
            ))}
          </NoteList>
        )}
      </div>

      {archiveClearKeys ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/60"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dismiss"
            onClick={cancelArchiveClear}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-clear-title"
            className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="archive-clear-title"
              className="text-base font-medium text-stone-900 dark:text-stone-100"
            >
              Clear archived items
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Remove {archiveClearKeys.length}{' '}
              archived {archiveClearKeys.length === 1 ? 'item' : 'items'}{' '}
              currently shown? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelArchiveClear}
                className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchiveClear}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
