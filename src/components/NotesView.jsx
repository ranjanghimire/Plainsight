import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { useArchiveMode } from '../context/ArchiveModeContext';
import { useCategorySwipeNavigation } from '../hooks/useCategorySwipeNavigation';
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

/** View Transitions API: single named snapshot for the notes body under category chips. */
const NOTES_BODY_VIEW_TRANSITION_NAME = 'plainsight-notes-body';

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

function filterNotesByCategory(source, filter) {
  if (!filter) return source;
  if (filter === UNCATEGORIZED_FILTER) {
    return source.filter(noteHasNoCategory);
  }
  return source.filter((n) => n.category === filter);
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
  const workspaceSwipeRef = useRef(null);
  /** Live category swipe pan (non-archive); cleared when gesture ends. */
  const [categorySwipePan, setCategorySwipePan] = useState(null);
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

  const categorySwipeSequence = useMemo(() => {
    const seq = [null, ...categories];
    if (hasUncategorizedNotes) seq.push(UNCATEGORIZED_FILTER);
    return seq;
  }, [categories, hasUncategorizedNotes]);

  const { categoryPrevFilter, categoryNextFilter } = useMemo(() => {
    const seq = categorySwipeSequence;
    let i = seq.findIndex((f) => Object.is(f, categoryFilter));
    if (i < 0) i = 0;
    return {
      categoryPrevFilter: seq[(i - 1 + seq.length) % seq.length],
      categoryNextFilter: seq[(i + 1) % seq.length],
    };
  }, [categorySwipeSequence, categoryFilter]);

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

  const applyCategoryFilter = useCallback((next, opts = {}) => {
    const useViewTransition = opts.useViewTransition !== false;
    if (next === categoryFilter) return;
    if (categoryListLockRef.current) return;
    categoryListLockRef.current = true;
    categoryListTimersRef.current.forEach(clearTimeout);
    categoryListTimersRef.current = [];

    const unlock = () => {
      categoryListLockRef.current = false;
    };

    const commit = () => {
      flushSync(() => {
        setCategoryFilter(next);
        setCategoryListPhase('idle');
      });
    };

    const doc = typeof document !== 'undefined' ? document : null;
    if (useViewTransition && doc && typeof doc.startViewTransition === 'function') {
      try {
        const vt = doc.startViewTransition(commit);
        void vt.finished.finally(() => {
          window.setTimeout(unlock, 32);
        });
      } catch {
        commit();
        window.setTimeout(unlock, CATEGORY_LIST_FADE_MS);
      }
      return;
    }

    if (useViewTransition) {
      setCategoryListPhase('hidden');
      const t1 = window.setTimeout(() => {
        commit();
        const t2 = window.setTimeout(unlock, CATEGORY_LIST_FADE_MS);
        categoryListTimersRef.current.push(t2);
      }, CATEGORY_LIST_SWAP_MS);
      categoryListTimersRef.current.push(t1);
      return;
    }

    commit();
    window.setTimeout(unlock, 32);
  }, [categoryFilter]);

  const commitSwipeCategory = useCallback(
    (next) => applyCategoryFilter(next, { useViewTransition: false }),
    [applyCategoryFilter],
  );

  const filteredBySearch = useSearch(notes, inputValue);
  const filteredNotes = useMemo(
    () => filterNotesByCategory(filteredBySearch, categoryFilter),
    [filteredBySearch, categoryFilter],
  );

  const prevFilteredNotes = useMemo(
    () => filterNotesByCategory(filteredBySearch, categoryPrevFilter),
    [filteredBySearch, categoryPrevFilter],
  );

  const nextFilteredNotes = useMemo(
    () => filterNotesByCategory(filteredBySearch, categoryNextFilter),
    [filteredBySearch, categoryNextFilter],
  );

  useCategorySwipeNavigation({
    elementRef: workspaceSwipeRef,
    filterSequence: categorySwipeSequence,
    categoryFilter,
    onSelectFilter: commitSwipeCategory,
    isInteractionLocked: () => categoryListLockRef.current,
    interactive: !archiveMode,
    onPan: archiveMode ? undefined : setCategorySwipePan,
  });

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
    applyCategoryFilter(name, { useViewTransition: true });
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

  const notesListEmptyText =
    notes.length === 0
      ? 'No notes yet. Add one above.'
      : 'No notes match your search or filter.';

  const renderNoteCards = (list) =>
    list.map((note) => (
      <NoteCard
        key={note.id}
        note={note}
        categories={categories}
        onUpdate={updateNote}
        onDelete={deleteNote}
        onAddCategory={addCategory}
      />
    ));

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCategoryFilter(null);
      setCategoryListPhase('idle');
      categoryListLockRef.current = false;
      categoryListTimersRef.current.forEach(clearTimeout);
      categoryListTimersRef.current = [];
      setCategorySwipePan(null);
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
      className={`flex min-h-0 flex-1 flex-col gap-4 origin-top transition-all duration-200 ease-out ${
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
        onCategoryChange={(f) => applyCategoryFilter(f, { useViewTransition: true })}
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
        ref={workspaceSwipeRef}
        data-testid="notes-workspace-swipe-area"
        className="flex min-h-0 flex-1 flex-col touch-pan-y"
      >
        {archiveMode ? (
          <div
            className={`flex min-h-0 flex-1 flex-col transition-all duration-200 ease-out ${
              categoryListPhase === 'hidden'
                ? 'opacity-0 translate-y-[3px]'
                : 'opacity-100 translate-y-0'
            }`}
            style={{ viewTransitionName: NOTES_BODY_VIEW_TRANSITION_NAME }}
          >
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
              rootClassName="flex min-h-0 flex-1 flex-col"
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
          </div>
        ) : categorySwipePan ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex h-full min-h-0 will-change-transform"
              style={{
                width: '200%',
                transform: `translateX(${categorySwipePan.tx}px)`,
              }}
            >
              {categorySwipePan.mode === 'next' ? (
                <>
                  <div className="box-border flex min-h-0 w-1/2 shrink-0 flex-col pr-1">
                    <NoteList
                      archiveMode={false}
                      subtitle={null}
                      isEmpty={filteredNotes.length === 0}
                      emptyText={notesListEmptyText}
                      rootClassName="flex min-h-0 flex-1 flex-col"
                    >
                      {renderNoteCards(filteredNotes)}
                    </NoteList>
                  </div>
                  <div className="box-border flex min-h-0 w-1/2 shrink-0 flex-col pl-1">
                    <NoteList
                      archiveMode={false}
                      subtitle={null}
                      isEmpty={nextFilteredNotes.length === 0}
                      emptyText={notesListEmptyText}
                      rootClassName="flex min-h-0 flex-1 flex-col"
                    >
                      {renderNoteCards(nextFilteredNotes)}
                    </NoteList>
                  </div>
                </>
              ) : (
                <>
                  <div className="box-border flex min-h-0 w-1/2 shrink-0 flex-col pr-1">
                    <NoteList
                      archiveMode={false}
                      subtitle={null}
                      isEmpty={prevFilteredNotes.length === 0}
                      emptyText={notesListEmptyText}
                      rootClassName="flex min-h-0 flex-1 flex-col"
                    >
                      {renderNoteCards(prevFilteredNotes)}
                    </NoteList>
                  </div>
                  <div className="box-border flex min-h-0 w-1/2 shrink-0 flex-col pl-1">
                    <NoteList
                      archiveMode={false}
                      subtitle={null}
                      isEmpty={filteredNotes.length === 0}
                      emptyText={notesListEmptyText}
                      rootClassName="flex min-h-0 flex-1 flex-col"
                    >
                      {renderNoteCards(filteredNotes)}
                    </NoteList>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`flex min-h-0 flex-1 flex-col transition-all duration-200 ease-out ${
              categoryListPhase === 'hidden'
                ? 'opacity-0 translate-y-[3px]'
                : 'opacity-100 translate-y-0'
            }`}
            style={{ viewTransitionName: NOTES_BODY_VIEW_TRANSITION_NAME }}
          >
            <NoteList
              archiveMode={false}
              subtitle={null}
              isEmpty={filteredNotes.length === 0}
              emptyText={notesListEmptyText}
              rootClassName="flex min-h-0 flex-1 flex-col"
            >
              {renderNoteCards(filteredNotes)}
            </NoteList>
          </div>
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
