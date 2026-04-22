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

/** Category swipe (matches hook horizontal ratio). */
const CATEGORY_SWIPE_H_AXIS = 1.2;
const CATEGORY_SWIPE_MIDPOINT = 0.5;
/** Slow drag needs ~50%; strong horizontal velocity lowers required progress (vx px/ms, next = negative). */
const CATEGORY_SWIPE_VEL_BASE = 0.07;
const CATEGORY_SWIPE_VEL_COEFF = 0.78;
const CATEGORY_SWIPE_MIN_COMMIT_PROGRESS = 0.065;
const CATEGORY_SWIPE_MAX_SETTLE_MS = 520;

/** Required drag progress (0–1) to commit “next”; lower when flicking left (vx negative). */
function categorySwipeRequiredProgressNext(vx) {
  const towardNext = Math.max(0, -vx - CATEGORY_SWIPE_VEL_BASE);
  return Math.max(
    CATEGORY_SWIPE_MIN_COMMIT_PROGRESS,
    CATEGORY_SWIPE_MIDPOINT - CATEGORY_SWIPE_VEL_COEFF * towardNext,
  );
}

/** Required progress to commit “prev”; lower when flicking right (vx positive). */
function categorySwipeRequiredProgressPrev(vx) {
  const towardPrev = Math.max(0, vx - CATEGORY_SWIPE_VEL_BASE);
  return Math.max(
    CATEGORY_SWIPE_MIN_COMMIT_PROGRESS,
    CATEGORY_SWIPE_MIDPOINT - CATEGORY_SWIPE_VEL_COEFF * towardPrev,
  );
}

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

function archivedListSortedForCategoryAndSearch(archivedNotesMap, categoryFilterKey, inputValue) {
  const list = Object.values(archivedNotesMap).filter((e) =>
    archivedEntryMatchesCategory(e, categoryFilterKey),
  );
  const q = String(inputValue || '').trim().toLowerCase();
  const searched = !q
    ? list
    : list.filter((e) => (e.text || '').toLowerCase().includes(q));
  return [...searched].sort((a, b) => b.lastDeletedAt - a.lastDeletedAt);
}

/** Subtitle line for archive header row (matches chip filter). */
function archiveSubtitleForChipFilter(categoryFilter) {
  if (categoryFilter == null) {
    return 'Archived items (All categories)';
  }
  return `Archived items for ${
    categoryFilter === UNCATEGORIZED_FILTER ? 'Undefined' : categoryFilter
  }`;
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

/**
 * Map hook pan (2-up preview) to translateX on a stable 3-up strip [prev | current | next].
 * Idle centers on `current` at -w; "next" pan moves toward -2w; "prev" toward 0.
 */
function categorySwipeStripTranslatePx(pan, w) {
  const width = Math.max(1, w);
  if (!pan) return -width;
  if (pan.mode === 'next') return -width + pan.tx;
  return pan.tx;
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
  /** Live category swipe pan (notes + archive); cleared when gesture ends. */
  const [categorySwipePan, setCategorySwipePan] = useState(null);
  const [swipeStripTransition, setSwipeStripTransition] = useState(null);
  const [workspaceSwipeWidth, setWorkspaceSwipeWidth] = useState(0);
  const categorySwipeSettlingRef = useRef(false);
  const categorySwipeSettleTimerRef = useRef(0);
  const settleFinishRef = useRef(null);
  const [swipeChipSync, setSwipeChipSync] = useState({ active: false });
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
    const cur = seq[i];
    return {
      categoryPrevFilter: i > 0 ? seq[i - 1] : cur,
      categoryNextFilter: i < seq.length - 1 ? seq[i + 1] : cur,
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

  useEffect(() => {
    const el = workspaceSwipeRef.current;
    if (!el) return undefined;
    setWorkspaceSwipeWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      setWorkspaceSwipeWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
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

  const handleCategorySwipePan = useCallback((p) => {
    if (!p) {
      if (categorySwipeSettleTimerRef.current) {
        clearTimeout(categorySwipeSettleTimerRef.current);
        categorySwipeSettleTimerRef.current = 0;
      }
      categorySwipeSettlingRef.current = false;
      settleFinishRef.current = null;
      setSwipeStripTransition(null);
      setCategorySwipePan(null);
      setSwipeChipSync({ active: false });
      return;
    }
    setSwipeStripTransition(null);
    setCategorySwipePan(p);
  }, []);

  const handleCategoryPanRelease = useCallback(
    (release) => {
      const { mode, tx, w, vx, dx, dy } = release;
      const width = Math.max(1, w);

      const mostlyHorizontal =
        Math.abs(dx) > Math.abs(dy) * CATEGORY_SWIPE_H_AXIS ||
        Math.abs(dx) >= 36;

      let gestureCommit = false;
      if (mostlyHorizontal) {
        if (mode === 'next') {
          const prog = -tx / width;
          gestureCommit = prog >= categorySwipeRequiredProgressNext(vx);
        } else {
          const prog = (tx + width) / width;
          gestureCommit = prog >= categorySwipeRequiredProgressPrev(vx);
        }
      }

      const seq = categorySwipeSequence;
      let idx = seq.findIndex((f) => Object.is(f, categoryFilter));
      if (idx < 0) idx = 0;
      const canGoNext = idx < seq.length - 1;
      const canGoPrev = idx > 0;
      const canNavigate =
        (mode === 'next' && canGoNext) || (mode === 'prev' && canGoPrev);
      const shouldCommit = gestureCommit && canNavigate;

      const restTx = mode === 'next' ? 0 : -width;
      const committedTx = mode === 'next' ? -width : 0;
      const toTx = shouldCommit ? committedTx : restTx;

      const travelRatio = Math.abs(toTx - tx) / width;
      const speed = Math.abs(vx);
      const durationMs = Math.max(
        210,
        Math.min(
          CATEGORY_SWIPE_MAX_SETTLE_MS,
          Math.round(
            (shouldCommit ? 300 : 255) +
              200 * travelRatio -
              Math.min(speed, 0.95) * (shouldCommit ? 140 : 115),
          ),
        ),
      );

      const commitTarget = shouldCommit
        ? mode === 'next'
          ? seq[idx + 1]
          : seq[idx - 1]
        : undefined;

      if (shouldCommit) {
        setSwipeChipSync({ active: true, filter: commitTarget, ms: durationMs });
      } else {
        setSwipeChipSync({ active: false });
      }

      if (categorySwipeSettleTimerRef.current) {
        clearTimeout(categorySwipeSettleTimerRef.current);
        categorySwipeSettleTimerRef.current = 0;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (categorySwipeSettleTimerRef.current) {
          clearTimeout(categorySwipeSettleTimerRef.current);
          categorySwipeSettleTimerRef.current = 0;
        }
        settleFinishRef.current = null;
        categorySwipeSettlingRef.current = false;
        setSwipeStripTransition(null);
        setCategorySwipePan(null);
        if (shouldCommit) {
          commitSwipeCategory(commitTarget);
        }
        setSwipeChipSync({ active: false });
      };
      settleFinishRef.current = finish;

      categorySwipeSettlingRef.current = true;
      setSwipeStripTransition(null);
      setCategorySwipePan({ mode, tx, w: width });

      const ease = shouldCommit
        ? 'cubic-bezier(0.22, 1, 0.36, 1)'
        : 'cubic-bezier(0.34, 0.9, 0.32, 1)';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCategorySwipePan({ mode, tx: toTx, w: width });
          setSwipeStripTransition(`transform ${durationMs}ms ${ease}`);
          categorySwipeSettleTimerRef.current = window.setTimeout(
            finish,
            durationMs + 70,
          );
        });
      });
    },
    [categoryFilter, categorySwipeSequence, commitSwipeCategory],
  );

  const onCategorySwipeStripTransitionEnd = useCallback((e) => {
    if (e.propertyName !== 'transform') return;
    settleFinishRef.current?.();
  }, []);

  useEffect(() => {
    return () => {
      if (categorySwipeSettleTimerRef.current) {
        clearTimeout(categorySwipeSettleTimerRef.current);
        categorySwipeSettleTimerRef.current = 0;
      }
    };
  }, []);

  useCategorySwipeNavigation({
    elementRef: workspaceSwipeRef,
    filterSequence: categorySwipeSequence,
    categoryFilter,
    onSelectFilter: commitSwipeCategory,
    isInteractionLocked: () =>
      categoryListLockRef.current || categorySwipeSettlingRef.current,
    interactive: true,
    onPan: handleCategorySwipePan,
    onPanRelease: handleCategoryPanRelease,
  });

  const archivedSorted = useMemo(
    () =>
      archivedListSortedForCategoryAndSearch(
        archivedNotesMap,
        categoryFilter,
        inputValue,
      ),
    [archivedNotesMap, categoryFilter, inputValue],
  );

  const prevArchivedSorted = useMemo(
    () =>
      archivedListSortedForCategoryAndSearch(
        archivedNotesMap,
        categoryPrevFilter,
        inputValue,
      ),
    [archivedNotesMap, categoryPrevFilter, inputValue],
  );

  const nextArchivedSorted = useMemo(
    () =>
      archivedListSortedForCategoryAndSearch(
        archivedNotesMap,
        categoryNextFilter,
        inputValue,
      ),
    [archivedNotesMap, categoryNextFilter, inputValue],
  );

  const handleCreateNote = (text, opts) => {
    if (!text?.trim()) return;
    const cat =
      categoryFilter === UNCATEGORIZED_FILTER ? null : categoryFilter;
    addNote(text.trim(), cat, { boldFirstLine: Boolean(opts?.boldFirstLine) });
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

  const openArchiveClearConfirmFromList = useCallback((list) => {
    const keys = list.map((e) => e.text);
    if (keys.length === 0) return;
    setArchiveClearKeys(keys);
  }, []);

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

  const renderArchivedCards = (list) =>
    list.map((entry) => (
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
        onPermanentDeleteArchived={permanentlyDeleteArchived}
        archiveAnimating={!!restoringKeys[entry.text]}
        bulkDissolve={!!archiveClearDissolveKeys[entry.text]}
      />
    ));

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCategoryFilter(null);
      setCategoryListPhase('idle');
      categoryListLockRef.current = false;
      categoryListTimersRef.current.forEach(clearTimeout);
      categoryListTimersRef.current = [];
      if (categorySwipeSettleTimerRef.current) {
        clearTimeout(categorySwipeSettleTimerRef.current);
        categorySwipeSettleTimerRef.current = 0;
      }
      categorySwipeSettlingRef.current = false;
      settleFinishRef.current = null;
      setSwipeStripTransition(null);
      setCategorySwipePan(null);
      setSwipeChipSync({ active: false });
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
        chipHighlightActive={swipeChipSync.active}
        chipHighlightFilter={swipeChipSync.active ? swipeChipSync.filter : undefined}
        chipHighlightTransitionMs={swipeChipSync.active ? swipeChipSync.ms : undefined}
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
            className={`relative flex min-h-0 flex-1 flex-col overflow-hidden transition-all duration-200 ease-out ${
              categoryListPhase === 'hidden'
                ? 'opacity-0 translate-y-[3px]'
                : 'opacity-100 translate-y-0'
            }`}
            style={{ viewTransitionName: NOTES_BODY_VIEW_TRANSITION_NAME }}
          >
            <div
              className="flex h-full min-h-0 will-change-transform"
              onTransitionEnd={onCategorySwipeStripTransitionEnd}
              style={{
                width: '300%',
                transform: `translateX(${categorySwipeStripTranslatePx(
                  categorySwipePan,
                  categorySwipePan?.w ?? workspaceSwipeWidth,
                )}px)`,
                transition: swipeStripTransition ?? undefined,
              }}
            >
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
                <NoteList
                  archiveMode
                  subtitle={archiveSubtitleForChipFilter(categoryPrevFilter)}
                  onArchiveClearAll={
                    prevArchivedSorted.length > 0
                      ? () => openArchiveClearConfirmFromList(prevArchivedSorted)
                      : undefined
                  }
                  isEmpty={prevArchivedSorted.length === 0}
                  emptyText="No archived items for this category"
                  rootClassName="flex min-h-0 flex-1 flex-col"
                >
                  {renderArchivedCards(prevArchivedSorted)}
                </NoteList>
              </div>
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
                <NoteList
                  archiveMode
                  subtitle={archiveSubtitleForChipFilter(categoryFilter)}
                  onArchiveClearAll={
                    archivedSorted.length > 0
                      ? () => openArchiveClearConfirmFromList(archivedSorted)
                      : undefined
                  }
                  isEmpty={archivedSorted.length === 0}
                  emptyText="No archived items for this category"
                  listGridHidden={archiveClearListHidden}
                  emptyIntro={archiveEmptyIntro}
                  rootClassName="flex min-h-0 flex-1 flex-col"
                >
                  {renderArchivedCards(archivedSorted)}
                </NoteList>
              </div>
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
                <NoteList
                  archiveMode
                  subtitle={archiveSubtitleForChipFilter(categoryNextFilter)}
                  onArchiveClearAll={
                    nextArchivedSorted.length > 0
                      ? () => openArchiveClearConfirmFromList(nextArchivedSorted)
                      : undefined
                  }
                  isEmpty={nextArchivedSorted.length === 0}
                  emptyText="No archived items for this category"
                  rootClassName="flex min-h-0 flex-1 flex-col"
                >
                  {renderArchivedCards(nextArchivedSorted)}
                </NoteList>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`relative flex min-h-0 flex-1 flex-col overflow-hidden transition-all duration-200 ease-out ${
              categoryListPhase === 'hidden'
                ? 'opacity-0 translate-y-[3px]'
                : 'opacity-100 translate-y-0'
            }`}
            style={{ viewTransitionName: NOTES_BODY_VIEW_TRANSITION_NAME }}
          >
            <div
              className="flex h-full min-h-0 will-change-transform"
              onTransitionEnd={onCategorySwipeStripTransitionEnd}
              style={{
                width: '300%',
                transform: `translateX(${categorySwipeStripTranslatePx(
                  categorySwipePan,
                  categorySwipePan?.w ?? workspaceSwipeWidth,
                )}px)`,
                transition: swipeStripTransition ?? undefined,
              }}
            >
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
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
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
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
              <div className="box-border flex min-h-0 w-1/3 shrink-0 flex-col px-1">
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
            </div>
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
