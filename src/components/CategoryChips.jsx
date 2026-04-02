import { useState, useEffect } from 'react';
import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';
import { useItemContextMenu } from '../hooks/useItemContextMenu';
import { ContextActionPopover } from './ContextActionPopover';
import { ConfirmDialog } from './ConfirmDialog';

function chipBase(active) {
  return active
    ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-200'
    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600';
}

export function CategoryChips({
  categories,
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={`px-2.5 py-1 rounded-md text-sm ${chipBase(categoryFilter === null)}`}
        >
          All
        </button>
        {categories.map((cat) =>
          categoryEditKey === cat ? (
            <span key={cat} className="inline-flex items-center gap-1">
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
              className={`px-2.5 py-1 rounded-md text-sm touch-manipulation ${chipBase(categoryFilter === cat)}`}
            >
              {cat}
            </button>
          ),
        )}
        {hasUncategorizedNotes && (
          <button
            type="button"
            onClick={() => onCategoryChange(UNCATEGORIZED_FILTER)}
            className={`px-2.5 py-1 rounded-md text-sm ${chipBase(categoryFilter === UNCATEGORIZED_FILTER)}`}
          >
            Undefined
          </button>
        )}
        {showInlineAddCategory ? (
          <span className="inline-flex items-center gap-1">
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
            className="px-2.5 py-1 rounded-md text-sm bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-400 dark:hover:bg-stone-600"
          >
            + Add category
          </button>
        )}
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
