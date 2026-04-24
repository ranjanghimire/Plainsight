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
    <div className={`relative min-w-0 max-w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white/90 px-2.5 py-1.5 text-left text-xs font-medium text-stone-700 shadow-sm shadow-stone-900/[0.04] ring-1 ring-stone-900/[0.03] transition-[border-color,background-color,box-shadow,ring-color] hover:border-stone-300 hover:bg-white hover:shadow-md hover:shadow-stone-900/[0.06] dark:border-stone-600/70 dark:bg-stone-800/90 dark:text-stone-200 dark:shadow-none dark:ring-white/[0.04] dark:hover:border-stone-500 dark:hover:bg-stone-800"
      >
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-stone-400 dark:text-stone-500" aria-hidden>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M4 6a2 2 0 012-2h2l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1 truncate">{currentCategory || triggerLabel}</span>
        <span className="inline-flex shrink-0 text-stone-400 dark:text-stone-500" aria-hidden>
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {typeof document !== 'undefined' && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
