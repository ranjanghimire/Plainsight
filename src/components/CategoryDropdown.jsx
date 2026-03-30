import { useState, useRef, useEffect } from 'react';

export function CategoryDropdown({
  categories,
  currentCategory,
  onSelect,
  onAddNew,
  triggerLabel = '+Add category',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleSelect = (cat) => {
    onSelect(cat);
    setOpen(false);
  };

  const handleAddNew = () => {
    const name = newCategoryName.trim();
    if (name) {
      onAddNew(name);
      onSelect(name);
      setNewCategoryName('');
      setShowNewInput(false);
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
      >
        {currentCategory || triggerLabel}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 py-1 min-w-[140px] rounded-lg border border-stone-200 bg-white shadow-lg z-10 dark:border-stone-600 dark:bg-stone-800">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleSelect(c)}
              className="block w-full text-left px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              {c}
            </button>
          ))}
          {showNewInput ? (
            <div className="flex gap-1 px-2 py-1.5 border-t border-stone-100 dark:border-stone-700">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew();
                  if (e.key === 'Escape') setShowNewInput(false);
                }}
                placeholder="New category"
                className="flex-1 px-2 py-1 text-base rounded border border-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200"
                autoFocus
              />
              <button
                type="button"
                onClick={handleAddNew}
                className="text-sm text-stone-600 hover:text-stone-800 dark:text-stone-400"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowNewInput(true);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700"
            >
              +Add new category
            </button>
          )}
        </div>
      )}
    </div>
  );
}
