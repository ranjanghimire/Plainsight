import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';
import {
  useItemContextMenu,
  CONTEXT_MENU_TRIGGER_CLASS,
} from '../hooks/useItemContextMenu';
import { ContextActionPopover } from './ContextActionPopover';
import { ConfirmDialog } from './ConfirmDialog';

/** One look for all unselected chips; selected state stays obvious. */
function chipTone(selected, motionClass) {
  if (selected) {
    return `${motionClass}bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-200`;
  }
  return `${motionClass}bg-stone-100 text-stone-700 hover:bg-stone-200/95 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600`;
}

const CHIP_PAD = 'shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md text-sm';

/** Fixed track height so “+ Add category” / rename inline never changes row layout. */
const CHIP_ROW_MIN_H = 'min-h-10';
const CHIP_INLINE_CTRL_H = 'h-8 min-h-0';

/** Stable `data-testid` segment for a category label (home page tests). */
export function categoryChipTestIdSlug(name) {
  const s = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return s || 'category';
}

export function CategoryChips({
  categories,
  categoryFilter,
  /** When true, chip selection reflects `chipHighlightFilter` (e.g. swipe settle in sync with notes strip). */
  chipHighlightActive = false,
  /** Filter value to show selected when `chipHighlightActive` (including `null` for All). */
  chipHighlightFilter,
  /** Selection background transition duration (ms), matched to notes strip settle. */
  chipHighlightTransitionMs,
  onCategoryChange,
  hasUncategorizedNotes,
  showInlineAddCategory,
  setShowInlineAddCategory,
  inlineNewCategoryName,
  setInlineNewCategoryName,
  handleInlineAddCategory,
  renameCategory,
  deleteCategory,
  workspaceSwitchGeneration,
}) {
  const catMenu = useItemContextMenu();
  const chipSel = chipHighlightActive ? chipHighlightFilter : categoryFilter;
  const chipMs =
    chipHighlightActive && chipHighlightTransitionMs != null && chipHighlightTransitionMs > 0
      ? Math.round(chipHighlightTransitionMs)
      : null;
  const chipMotionStyle =
    chipMs != null
      ? {
          transitionProperty: 'background-color, color',
          transitionDuration: `${chipMs}ms`,
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }
      : undefined;
  const chipMotionClass = chipMs != null ? 'will-change-[background-color,color] ' : '';
  const [categoryEditKey, setCategoryEditKey] = useState(null);
  const [categoryEditDraft, setCategoryEditDraft] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState(null);
  const inlineAddAnchorRef = useRef(null);

  useEffect(() => {
    catMenu.closeMenu();
  }, [workspaceSwitchGeneration, catMenu.closeMenu]);

  /** Inline add sits at the end of a horizontal scroller; bring input + actions into view when opened. */
  useLayoutEffect(() => {
    if (!showInlineAddCategory) return undefined;
    const revealInlineAdd = () => {
      const el = inlineAddAnchorRef.current;
      if (!el) return;
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'end',
        });
        return;
      }
      let node = el.parentElement;
      while (node && node !== document.body) {
        if (node.scrollWidth > node.clientWidth + 1) {
          node.scrollLeft = node.scrollWidth - node.clientWidth;
          break;
        }
        node = node.parentElement;
      }
    };
    revealInlineAdd();
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(revealInlineAdd);
    });
    return () => window.cancelAnimationFrame(id);
  }, [showInlineAddCategory]);

  const cancelCategoryEdit = () => {
    setCategoryEditKey(null);
    setCategoryEditDraft('');
  };

  const commitCategoryRename = (oldName) => {
    const next = categoryEditDraft.trim();
    if (!next) {
      cancelCategoryEdit();
      return;
    }
    if (next === oldName) {
      cancelCategoryEdit();
      return;
    }
    renameCategory(oldName, next);
    if (categoryFilter === oldName) onCategoryChange(next);
    cancelCategoryEdit();
  };

  return (
    <>
      <div className="w-full min-w-0 -mx-0.5">
        <div
          data-testid="category-chips-row"
          className={`flex flex-nowrap items-center gap-x-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-0.5 pl-0.5 pr-1 ${CHIP_ROW_MIN_H} [scrollbar-width:thin] [scrollbar-color:rgba(120,113,108,0.35)_transparent] dark:[scrollbar-color:rgba(168,162,158,0.3)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/45 dark:[&::-webkit-scrollbar-thumb]:bg-stone-500/40`}
          style={{ WebkitOverflowScrolling: 'touch', scrollPaddingInlineEnd: '0.5rem' }}
        >
          <button
            type="button"
            data-testid="category-chip--all"
            onClick={() => onCategoryChange(null)}
            style={chipMotionStyle}
            className={`${CHIP_PAD} ${chipTone(chipSel === null, chipMotionClass)}`}
          >
            All
          </button>
          {categories.map((cat) =>
            categoryEditKey === cat ? (
              <span key={cat} className="inline-flex h-10 shrink-0 items-center gap-1">
                <input
                  type="text"
                  value={categoryEditDraft}
                  onChange={(e) => setCategoryEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCategoryRename(cat);
                    if (e.key === 'Escape') cancelCategoryEdit();
                  }}
                  className={`${CHIP_INLINE_CTRL_H} w-28 box-border px-2 text-base leading-none rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => commitCategoryRename(cat)}
                  className={`${CHIP_INLINE_CTRL_H} inline-flex items-center justify-center px-2 text-sm rounded-md bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-600 dark:text-stone-200`}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelCategoryEdit}
                  className={`${CHIP_INLINE_CTRL_H} inline-flex items-center justify-center px-2 text-sm rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700`}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                key={cat}
                type="button"
                data-testid={`category-chip--${categoryChipTestIdSlug(cat)}`}
                {...catMenu.bindTrigger(
                  { kind: 'category', name: cat },
                  () => onCategoryChange(cat),
                )}
                style={chipMotionStyle}
                className={`${CHIP_PAD} ${CONTEXT_MENU_TRIGGER_CLASS} ${chipTone(chipSel === cat, chipMotionClass)}`}
              >
                {cat}
              </button>
            ),
          )}
          {hasUncategorizedNotes && (
            <button
              type="button"
              data-testid="category-chip--undefined-filter"
              onClick={() => onCategoryChange(UNCATEGORIZED_FILTER)}
              style={chipMotionStyle}
              className={`${CHIP_PAD} ${chipTone(Object.is(chipSel, UNCATEGORIZED_FILTER), chipMotionClass)}`}
            >
              Undefined
            </button>
          )}
          {showInlineAddCategory ? (
            <span
              ref={inlineAddAnchorRef}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-stone-200/90 bg-white/95 px-1.5 shadow-sm ring-1 ring-stone-200/40 dark:border-stone-600 dark:bg-stone-900/95 dark:ring-stone-700/50"
            >
              <input
                type="text"
                data-testid="category-inline-name-input"
                value={inlineNewCategoryName}
                onChange={(e) => setInlineNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInlineAddCategory();
                  if (e.key === 'Escape') {
                    setInlineNewCategoryName('');
                    setShowInlineAddCategory(false);
                  }
                }}
                placeholder="New category"
                className={`${CHIP_INLINE_CTRL_H} min-w-[7.5rem] max-w-[40vw] flex-1 box-border px-2 text-base leading-none rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 sm:max-w-none sm:flex-none sm:w-32`}
                autoFocus
              />
              <button
                type="button"
                data-testid="category-inline-submit"
                onClick={handleInlineAddCategory}
                className={`${CHIP_INLINE_CTRL_H} inline-flex shrink-0 items-center justify-center px-2.5 text-sm font-medium rounded-md bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-600 dark:text-stone-100 dark:hover:bg-stone-500`}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setInlineNewCategoryName('');
                  setShowInlineAddCategory(false);
                }}
                className={`${CHIP_INLINE_CTRL_H} inline-flex shrink-0 items-center justify-center px-2.5 text-sm rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700`}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              data-testid="category-chip--add"
              onClick={() => setShowInlineAddCategory(true)}
              className={`${CHIP_PAD} bg-stone-50 text-stone-400 hover:bg-stone-100/90 dark:bg-stone-800/50 dark:text-stone-500 dark:hover:bg-stone-800/80`}
            >
              + Add category
            </button>
          )}
        </div>
      </div>

      <ContextActionPopover
        open={catMenu.menu.open}
        entered={catMenu.entered}
        x={catMenu.menu.x}
        y={catMenu.menu.y}
        showDelete={catMenu.menu.target?.kind === 'category'}
        onRename={() => {
          const t = catMenu.menu.target;
          if (t?.kind === 'category') {
            setCategoryEditKey(t.name);
            setCategoryEditDraft(t.name);
          }
        }}
        onDelete={() => {
          const t = catMenu.menu.target;
          if (t?.kind === 'category') setPendingDeleteCategory(t.name);
        }}
        onDismiss={catMenu.closeMenu}
      />

      <ConfirmDialog
        open={pendingDeleteCategory != null}
        title="Remove category"
        description={
          pendingDeleteCategory
            ? `Remove “${pendingDeleteCategory}”? Notes using it will become uncategorized.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onCancel={() => setPendingDeleteCategory(null)}
        onConfirm={() => {
          if (pendingDeleteCategory) {
            deleteCategory(pendingDeleteCategory);
            if (categoryFilter === pendingDeleteCategory) onCategoryChange(null);
          }
          setPendingDeleteCategory(null);
        }}
      />
    </>
  );
}
