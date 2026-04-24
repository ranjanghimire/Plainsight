import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

/** Above note chrome / context menus; aligned with NoteFormatPopover stack. */
const MENU_Z = 10000;

function getVisualBounds() {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

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
  const repositionRef = useRef(() => {});

  const categorySig = useMemo(
    () => `${categories?.length ?? 0}:${(categories || []).join('\0')}`,
    [categories],
  );

  useLayoutEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const reposition = () => {
      if (cancelled) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      const menuEl = menuRef.current;
      const menuW = Math.max(menuEl?.offsetWidth ?? 200, 180);
      const menuH = Math.max(menuEl?.offsetHeight ?? 200, 120);

      const { top: vTop, left: vLeft, width: vW, height: vH } = getVisualBounds();
      const visTop = vTop + pad;
      const visBottom = vTop + vH - pad;
      const visLeft = vLeft + pad;
      const visRight = vLeft + vW - pad;

      let left = Math.min(Math.max(visLeft, r.left), Math.max(visLeft, visRight - menuW));
      let top = r.bottom + 4;

      if (top + menuH > visBottom) {
        const above = r.top - menuH - 4;
        if (above >= visTop) {
          top = above;
        } else {
          top = Math.max(visTop, visBottom - menuH);
        }
      }

      top = Math.max(visTop, Math.min(top, visBottom - menuH));
      left = Math.max(visLeft, Math.min(left, visRight - menuW));

      setMenuPos({ top, left });
    };

    repositionRef.current = reposition;
    reposition();
    const raf1 = requestAnimationFrame(() => {
      reposition();
      requestAnimationFrame(reposition);
    });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', reposition);
      vv.addEventListener('scroll', reposition);
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    const t1 = window.setTimeout(reposition, 120);
    const t2 = window.setTimeout(reposition, 320);
    const t3 = window.setTimeout(reposition, 520);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (vv) {
        vv.removeEventListener('resize', reposition);
        vv.removeEventListener('scroll', reposition);
      }
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, showNewInput, categorySig]);

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
      className="fixed max-h-[min(72dvh,85svh)] min-w-[180px] max-w-[min(92vw,22rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-600 dark:bg-stone-800"
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
            onFocus={() => {
              const nudge = () => repositionRef.current();
              requestAnimationFrame(nudge);
              window.setTimeout(nudge, 80);
              window.setTimeout(nudge, 200);
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
