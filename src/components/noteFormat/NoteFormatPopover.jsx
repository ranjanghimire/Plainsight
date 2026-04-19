import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** “Text format” entry — compact paragraph mark. */
function FormatOptionsIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h9M4 12h6M4 18h12" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 8l2 2 4-4" />
    </svg>
  );
}

/** Same paper-plane stroke as the main “Add note” control (send). */
function PaperPlaneIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <g transform="rotate(90 12 12)">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
        />
      </g>
    </svg>
  );
}

function BoldToggleIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6"
      />
    </svg>
  );
}

function BulletsToggleIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6v12" />
    </svg>
  );
}

/** Collapse tray back to the single entry icon (points toward the right edge). */
function CollapseChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

const toggleBase =
  'flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors select-none';
const toggleShrink0 = `${toggleBase} shrink-0`;
const toggleOff = 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700';
const toggleOn = 'bg-stone-200 text-stone-900 dark:bg-stone-600 dark:text-stone-50';

/** Smooth open/close — anchor stays w-7 in layout; expanded tray is portaled fixed to avoid ancestor overflow clipping. */
const PANEL_MS = 320;
const PANEL_Z = 40;

export function NoteFormatPopover({
  expanded,
  onOpen,
  onClose,
  boldMode,
  onBoldChange,
  bulletsMode,
  onBulletsChange,
  onPopoverPointerDown,
  onPopoverPointerUp,
  textareaRef,
  value,
  setValue,
  toggleBullets,
}) {
  const [closing, setClosing] = useState(false);
  const [panelEnter, setPanelEnter] = useState(false);
  const [fixedStyle, setFixedStyle] = useState(null);
  const anchorRef = useRef(null);
  const hadExpandedRef = useRef(expanded);

  const renderPanel = expanded || closing;

  useLayoutEffect(() => {
    /* Exit animation needs `closing` updated before paint so the tag row does not flash. */
    /* eslint-disable react-hooks/set-state-in-effect -- layout sync for panel mount/unmount timing */
    if (expanded) {
      setClosing(false);
      hadExpandedRef.current = true;
    } else if (hadExpandedRef.current) {
      setClosing(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      let innerRaf = 0;
      const outerRaf = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => setPanelEnter(true));
      });
      return () => {
        cancelAnimationFrame(outerRaf);
        if (innerRaf) cancelAnimationFrame(innerRaf);
      };
    }
    const exitRaf = requestAnimationFrame(() => setPanelEnter(false));
    const t = window.setTimeout(() => setClosing(false), PANEL_MS);
    return () => {
      cancelAnimationFrame(exitRaf);
      window.clearTimeout(t);
    };
  }, [expanded]);

  /* eslint-disable react-hooks/set-state-in-effect -- fixed overlay coords from getBoundingClientRect / ResizeObserver */
  useLayoutEffect(() => {
    if (!renderPanel) {
      setFixedStyle(null);
      return;
    }
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;

    const update = () => {
      const r = el.getBoundingClientRect();
      const maxH = Math.min(window.innerHeight * 0.88, window.innerHeight - r.top - 8);
      setFixedStyle({
        position: 'fixed',
        top: r.top,
        right: Math.max(0, window.innerWidth - r.right),
        maxHeight: maxH,
        zIndex: PANEL_Z,
      });
    };

    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [renderPanel, panelEnter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showTrigger = !renderPanel;

  const panelClassName = `flex w-max max-w-[min(28rem,calc(100vw-2rem))] origin-top-right flex-wrap items-center justify-end gap-1 overflow-y-auto overflow-x-visible rounded-xl border border-stone-200/90 bg-stone-50/98 py-1.5 pl-2 pr-1 shadow-xl ring-1 ring-stone-900/5 backdrop-blur-sm transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-stone-600 dark:bg-stone-900/98 dark:ring-white/10 motion-reduce:duration-150 motion-reduce:ease-out ${
    panelEnter
      ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
      : 'pointer-events-none translate-y-2 scale-[0.97] opacity-0'
  }`;

  const panelNode = renderPanel ? (
    <div
      className={panelClassName}
      style={fixedStyle ?? { position: 'fixed', visibility: 'hidden', pointerEvents: 'none' }}
      role="dialog"
      aria-label="Note formatting options"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onBoldChange(!boldMode);
        }}
        className={`${toggleShrink0} ${boldMode ? toggleOn : toggleOff}`}
        aria-pressed={boldMode}
      >
        <BoldToggleIcon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">First line Bold</span>
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          const next = !bulletsMode;
          if (next) {
            toggleBullets(true, textareaRef?.current, value, setValue);
          } else {
            onBulletsChange(false);
          }
        }}
        className={`${toggleShrink0} ${bulletsMode ? toggleOn : toggleOff}`}
        aria-pressed={bulletsMode}
      >
        <BulletsToggleIcon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">Bullets</span>
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-700"
        aria-label="Collapse formatting options"
        title="Collapse"
      >
        <CollapseChevronIcon className="h-5 w-5" />
      </button>
    </div>
  ) : null;

  return (
    <>
      <div
        ref={anchorRef}
        className="relative flex min-h-7 w-7 shrink-0 flex-col justify-center self-stretch"
        onPointerDownCapture={onPopoverPointerDown}
        onPointerUpCapture={onPopoverPointerUp}
        onPointerCancelCapture={onPopoverPointerUp}
      >
        {showTrigger ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-stone-50/95 text-stone-500 shadow-sm transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900/95 dark:text-stone-400 dark:hover:bg-stone-800"
            aria-label="Note formatting options"
            aria-expanded={false}
          >
            <FormatOptionsIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {panelNode && typeof document !== 'undefined' ? createPortal(panelNode, document.body) : null}
    </>
  );
}

export function FloatingNoteSubmit({ visible, topPx, onClick, disabled }) {
  if (!visible) return null;
  const button = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className="fixed z-[9999] flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-800 shadow-lg transition-[top,opacity] duration-150 ease-out dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 disabled:pointer-events-none disabled:opacity-40"
      style={{
        top: topPx,
        bottom: 'auto',
        left: 'auto',
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
      aria-label="Send note"
    >
      <PaperPlaneIcon className="h-5 w-5" />
    </button>
  );
  if (typeof document !== 'undefined') {
    return createPortal(button, document.body);
  }
  return button;
}
