import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useArchiveMode } from '../context/ArchiveModeContext';
import { useSearch } from '../hooks/useSearch';
import { NoteCard } from './NoteCard';
import { SearchCommandBar } from './SearchCommandBar';
import { CategoryChips } from './CategoryChips';
import { NoteList } from './NoteList';
import { ConfirmDialog } from './ConfirmDialog';
import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';

/** Fade out → swap filter → fade in; lock blocks overlapping chip taps. */
const CATEGORY_LIST_SWAP_MS = 150;
const CATEGORY_LIST_FADE_MS = 200;

const ARCHIVE_CLEAR_STAGGER_MS = 60;
const ARCHIVE_CLEAR_CARD_FADE_MS = 180;
const ARCHIVE_CLEAR_CONTAINER_FADE_MS = 150;

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
    renameCategory,
    deleteCategory,
    restoreArchivedNote,
    updateArchivedNote,
    permanentlyDeleteArchived,
    removeArchivedByTextKeys,
    workspaceSwitchGeneration,
  } = useWorkspace();

  const { archiveMode, archiveViewTransitioning } = useArchiveMode();

  const [inputValue, setInputValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [categoryListPhase, setCategoryListPhase] = useState('idle');
  const categoryListLockRef = useRef(false);
  const categoryListTimersRef = useRef([]);
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

  useEffect(() => {
    return () => {
      categoryListTimersRef.current.forEach(clearTimeout);
      categoryListTimersRef.current = [];
      archiveClearTimersRef.current.forEach(clearTimeout);
      archiveClearTimersRef.current = [];
    };
  }, []);

  const applyCategoryFilter = useCallback((next) => {
    if (next === categoryFilter) return;
    if (categoryListLockRef.current) return;
    categoryListLockRef.current = true;
    setCategoryListPhase('hidden');
    categoryListTimersRef.current.forEach(clearTimeout);
    categoryListTimersRef.current = [];
    const t1 = window.setTimeout(() => {
      setCategoryFilter(next);
      setCategoryListPhase('idle');
      const t2 = window.setTimeout(() => {
        categoryListLockRef.current = false;
      }, CATEGORY_LIST_FADE_MS);
      categoryListTimersRef.current.push(t2);
    }, CATEGORY_LIST_SWAP_MS);
    categoryListTimersRef.current.push(t1);
  }, [categoryFilter]);

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
    applyCategoryFilter(name);
    setInlineNewCategoryName('');
    setShowInlineAddCategory(false);
  };

  const [archiveClearKeys, setArchiveClearKeys] = useState(null);
  const [archiveClearDissolveKeys, setArchiveClearDissolveKeys] = useState({});
  const [archiveClearListHidden, setArchiveClearListHidden] = useState(false);
  const [archiveEmptyIntro, setArchiveEmptyIntro] = useState(false);
  const archiveClearTimersRef = useRef([]);

  const openArchiveClearConfirm = useCallback(() => {
    const keys = archivedSorted.map((e) => e.text);
    if (keys.length === 0) return;
    setArchiveClearKeys(keys);
  }, [archivedSorted]);

  const confirmArchiveClear = useCallback(() => {
    const keys = archiveClearKeys?.length ? [...archiveClearKeys] : [];
    setArchiveClearKeys(null);
    if (!keys.length) return;

    archiveClearTimersRef.current.forEach(clearTimeout);
    archiveClearTimersRef.current = [];

    keys.forEach((k, i) => {
      const t = window.setTimeout(() => {
        setArchiveClearDissolveKeys((prev) => ({ ...prev, [k]: true }));
      }, i * ARCHIVE_CLEAR_STAGGER_MS);
      archiveClearTimersRef.current.push(t);
    });

    const lastStaggerStart = keys.length > 0 ? (keys.length - 1) * ARCHIVE_CLEAR_STAGGER_MS : 0;
    const afterCardsInvisible = lastStaggerStart + ARCHIVE_CLEAR_CARD_FADE_MS;

    const tGrid = window.setTimeout(() => {
      setArchiveClearListHidden(true);
    }, afterCardsInvisible);
    archiveClearTimersRef.current.push(tGrid);

    const tRemove = window.setTimeout(() => {
      removeArchivedByTextKeys(keys);
      setArchiveClearDissolveKeys({});
      setArchiveClearListHidden(false);
      setArchiveEmptyIntro(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setArchiveEmptyIntro(false));
      });
    }, afterCardsInvisible + ARCHIVE_CLEAR_CONTAINER_FADE_MS);
    archiveClearTimersRef.current.push(tRemove);
  }, [archiveClearKeys, removeArchivedByTextKeys]);

  const cancelArchiveClear = useCallback(() => {
    setArchiveClearKeys(null);
  }, []);

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

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCategoryFilter(null);
      setCategoryListPhase('idle');
      categoryListLockRef.current = false;
      categoryListTimersRef.current.forEach(clearTimeout);
      categoryListTimersRef.current = [];
    }, 0);
    return () => window.clearTimeout(t);
  }, [workspaceSwitchGeneration]);

  useEffect(() => {
    if (archiveMode) return undefined;
    archiveClearTimersRef.current.forEach(clearTimeout);
    archiveClearTimersRef.current = [];
    setArchiveClearDissolveKeys({});
    setArchiveClearListHidden(false);
    return undefined;
  }, [archiveMode]);

  return (
    <>
    <div
      className={`space-y-4 origin-top transition-all duration-200 ease-out ${
        archiveViewTransitioning
          ? 'opacity-0 scale-[0.98] brightness-95'
          : 'opacity-100 scale-100 brightness-100'
      }`}
    >
      <SearchCommandBar
        value={inputValue}
        onChange={setInputValue}
        onCreateNote={handleCreateNote}
        searchOnly={archiveMode}
      />

      <CategoryChips
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryChange={applyCategoryFilter}
        hasUncategorizedNotes={hasUncategorizedNotes}
        showInlineAddCategory={showInlineAddCategory}
        setShowInlineAddCategory={setShowInlineAddCategory}
        inlineNewCategoryName={inlineNewCategoryName}
        setInlineNewCategoryName={setInlineNewCategoryName}
        handleInlineAddCategory={handleInlineAddCategory}
        renameCategory={renameCategory}
        deleteCategory={deleteCategory}
        workspaceSwitchGeneration={workspaceSwitchGeneration}
      />

      <div
        className={`transition-all duration-200 ease-out ${
          categoryListPhase === 'hidden'
            ? 'opacity-0 translate-y-[3px]'
            : 'opacity-100 translate-y-0'
        }`}
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
            listGridHidden={archiveClearListHidden}
            emptyIntro={archiveEmptyIntro}
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
                bulkDissolve={!!archiveClearDissolveKeys[entry.text]}
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
    </div>

    <ConfirmDialog
      open={Array.isArray(archiveClearKeys) && archiveClearKeys.length > 0}
      title="Clear archived items"
      description={
        archiveClearKeys?.length
          ? `Remove ${archiveClearKeys.length} archived ${
              archiveClearKeys.length === 1 ? 'item' : 'items'
            } currently shown? This cannot be undone.`
          : ''
      }
      confirmLabel="Clear"
      cancelLabel="Cancel"
      destructive
      onCancel={cancelArchiveClear}
      onConfirm={confirmArchiveClear}
    />
    </>
  );
}
