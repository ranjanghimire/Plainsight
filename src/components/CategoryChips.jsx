import { useState, useEffect, useMemo } from 'react';
import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';
import {
  useItemContextMenu,
  CONTEXT_MENU_TRIGGER_CLASS,
} from '../hooks/useItemContextMenu';
import { ContextActionPopover } from './ContextActionPopover';
import { ConfirmDialog } from './ConfirmDialog';

/** @returns {'selected' | 'populated' | 'empty'} */
function categoryChipVariant(selected, hasNotes) {
  if (selected) return 'selected';
  if (hasNotes) return 'populated';
  return 'empty';
}

function categoryNameFromValue(c) {
  if (c == null || c === '') return null;
  const t = String(c).trim();
  return t || null;
}

const CHIP_PAD = 'shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md text-sm';

export function CategoryChips({
  categories,
  notes = [],
  archivedNotesMap = {},
  categoryFilter,
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
  const [categoryEditKey, setCategoryEditKey] = useState(null);
  const [categoryEditDraft, setCategoryEditDraft] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState(null);

  /** Built here (not from a Set prop) so deploy/runtime cannot lose Set identity or confuse serialized props. */
  const namesWithNotes = useMemo(() => {
    const s = new Set();
    for (const n of notes) {
      const key = categoryNameFromValue(n?.category);
      if (key) s.add(key);
    }
    for (const e of Object.values(archivedNotesMap)) {
      const key = categoryNameFromValue(e?.category);
      if (key) s.add(key);
    }
    return s;
  }, [notes, archivedNotesMap]);

  useEffect(() => {
    catMenu.closeMenu();
  }, [workspaceSwitchGeneration, catMenu.closeMenu]);

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

  const hasItems = (name) =>
    typeof name === 'string' && namesWithNotes.has(name.trim());

  return (
    <>
      <div className="w-full min-w-0 -mx-0.5">
        <div
          className="flex flex-nowrap items-center gap-x-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-0.5 pl-0.5 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(120,113,108,0.35)_transparent] dark:[scrollbar-color:rgba(168,162,158,0.3)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/45 dark:[&::-webkit-scrollbar-thumb]:bg-stone-500/40"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            data-chip={categoryChipVariant(categoryFilter === null, true)}
            className={`ps-cat-chip ${CHIP_PAD}`}
          >
            All
          </button>
          {categories.map((cat) =>
            categoryEditKey === cat ? (
              <span key={cat} className="inline-flex shrink-0 items-center gap-1">
                <input
                  type="text"
                  value={categoryEditDraft}
                  onChange={(e) => setCategoryEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCategoryRename(cat);
                    if (e.key === 'Escape') cancelCategoryEdit();
                  }}
                  className="w-28 px-2 py-1 text-base rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => commitCategoryRename(cat)}
                  className="px-2 py-1 text-sm rounded-md bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-600 dark:text-stone-200"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelCategoryEdit}
                  className="px-2 py-1 text-sm rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                key={cat}
                type="button"
                {...catMenu.bindTrigger(
                  { kind: 'category', name: cat },
                  () => onCategoryChange(cat),
                )}
                data-chip={categoryChipVariant(categoryFilter === cat, hasItems(cat))}
                className={`ps-cat-chip ${CHIP_PAD} ${CONTEXT_MENU_TRIGGER_CLASS}`}
              >
                {cat}
              </button>
            ),
          )}
          {hasUncategorizedNotes && (
            <button
              type="button"
              onClick={() => onCategoryChange(UNCATEGORIZED_FILTER)}
              data-chip={categoryChipVariant(
                categoryFilter === UNCATEGORIZED_FILTER,
                true,
              )}
              className={`ps-cat-chip ${CHIP_PAD}`}
            >
              Undefined
            </button>
          )}
          {showInlineAddCategory ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <input
                type="text"
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
                className="w-28 px-2 py-1 text-base rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
                autoFocus
              />
              <button
                type="button"
                onClick={handleInlineAddCategory}
                className="px-2 py-1 text-sm rounded-md bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-600 dark:text-stone-200"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setInlineNewCategoryName('');
                  setShowInlineAddCategory(false);
                }}
                className="px-2 py-1 text-sm rounded-md border border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
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
