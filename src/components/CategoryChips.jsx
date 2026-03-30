import { UNCATEGORIZED_FILTER } from '../constants/categoryFilters';

function chipBase(active) {
  return active
    ? 'bg-stone-300 text-stone-800 dark:bg-stone-600 dark:text-stone-200'
    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600';
}

export function CategoryChips({
  categories,
  categoryFilter,
  setCategoryFilter,
  hasUncategorizedNotes,
  showInlineAddCategory,
  setShowInlineAddCategory,
  inlineNewCategoryName,
  setInlineNewCategoryName,
  handleInlineAddCategory,
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      <button
        type="button"
        onClick={() => setCategoryFilter(null)}
        className={`px-2.5 py-1 rounded-md text-sm ${chipBase(categoryFilter === null)}`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => setCategoryFilter(cat)}
          className={`px-2.5 py-1 rounded-md text-sm ${chipBase(categoryFilter === cat)}`}
        >
          {cat}
        </button>
      ))}
      {hasUncategorizedNotes && (
        <button
          type="button"
          onClick={() => setCategoryFilter(UNCATEGORIZED_FILTER)}
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
  );
}
