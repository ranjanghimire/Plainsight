import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const MENU_Z = 1200;

export function CategoryDropdown({
  categories,
  currentCategory,
  onSelect,
  onAddNew,
  triggerLabel = '+ Category',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const menuW = 220;
    const menuH = 220;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const left = Math.min(Math.max(pad, r.left), Math.max(pad, vw - menuW - pad));
    const top = Math.min(Math.max(pad, r.bottom + 4), Math.max(pad, vh - menuH - pad));
    setMenuPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function close(e) {
      const t = triggerRef.current;
      const m = menuRef.current;
      if (t?.contains(e.target)) return;
      if (m?.contains(e.target)) return;
      setShowNewInput(false);
      setNewCategoryName('');
      setOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

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

  const menuPanel = open ? (
    <div
      ref={menuRef}
      className="fixed py-1 min-w-[180px] max-w-[min(92vw,22rem)] rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-600 dark:bg-stone-800"
      style={{
        top: menuPos.top,
        left: menuPos.left,
        zIndex: MENU_Z,
      }}
    >
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
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
      >
        {currentCategory || triggerLabel}
      </button>
      {typeof document !== 'undefined' && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
