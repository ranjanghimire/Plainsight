import { createPortal } from 'react-dom';

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

/** Collapse inline tray (chevron points right). */
function CollapseChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

const inlineBtnBase =
  'flex min-w-0 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors select-none';
const inlineOff =
  'text-stone-600 hover:bg-stone-100/90 dark:text-stone-300 dark:hover:bg-stone-700/80';
const inlineOn = 'bg-stone-200/90 text-stone-900 dark:bg-stone-600 dark:text-stone-50';

const expandTriggerClass =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors duration-200 hover:bg-stone-100/90 dark:text-stone-400 dark:hover:bg-stone-700/80';

const collapseTriggerClass =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors duration-200 hover:bg-stone-100/90 dark:text-stone-400 dark:hover:bg-stone-700/80';

const formatTrayMotion =
  'transition-[max-width,opacity] duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0';

/**
 * Inline format controls in the tag row: expand to show First line bold / Bullets; collapse with chevron only.
 */
export function NoteFormatPopover({
  expanded,
  onOpen,
  onClose,
  boldMode,
  onBoldChange,
  bulletsMode,
  textareaRef,
  value,
  setValue,
  applyBulletLineToggle,
}) {
  return (
    <div
      className="flex min-w-0 max-w-full shrink items-center justify-end gap-0 self-center"
      role="group"
      aria-label="Note formatting options"
    >
      <div
        className={`flex min-w-0 max-w-full flex-wrap items-center justify-end gap-0.5 overflow-hidden ${formatTrayMotion} ${
          expanded ? 'max-w-[min(100%,22rem)] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'
        }`}
        aria-hidden={!expanded}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onBoldChange(!boldMode);
          }}
          className={`${inlineBtnBase} shrink-0 ${boldMode ? inlineOn : inlineOff}`}
          aria-pressed={boldMode}
        >
          <BoldToggleIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">First line Bold</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            applyBulletLineToggle(textareaRef?.current, value, setValue);
          }}
          className={`${inlineBtnBase} shrink-0 ${bulletsMode ? inlineOn : inlineOff}`}
          aria-pressed={bulletsMode}
        >
          <BulletsToggleIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">Bullets</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`${collapseTriggerClass} shrink-0`}
          aria-label="Collapse formatting options"
          title="Collapse"
          aria-expanded={expanded}
        >
          <CollapseChevronIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        className={`shrink-0 overflow-hidden ${formatTrayMotion} ${
          expanded ? 'max-w-0 opacity-0 pointer-events-none' : 'max-w-7 opacity-100'
        }`}
        aria-hidden={expanded}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={expandTriggerClass}
          aria-label="Show note formatting options"
          aria-expanded={expanded}
        >
          <FormatOptionsIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} [props.compact] — Smaller floating control (e.g. note editor); search bar uses default larger size.
 */
export function FloatingNoteSubmit({ visible, topPx, onClick, disabled, compact = false }) {
  if (!visible) return null;
  const btnSize = compact ? 'h-12 w-12' : 'h-14 w-14';
  const iconSize = compact ? 'h-6 w-6' : 'h-7 w-7';
  const button = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`fixed z-[9999] flex ${btnSize} items-center justify-center rounded-full border border-stone-200 bg-white text-stone-800 shadow-lg transition-[top,opacity] duration-150 ease-out dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 disabled:pointer-events-none disabled:opacity-40`}
      style={{
        top: topPx,
        bottom: 'auto',
        left: 'auto',
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
      aria-label="Send note"
    >
      <PaperPlaneIcon className={iconSize} />
    </button>
  );
  if (typeof document !== 'undefined') {
    return createPortal(button, document.body);
  }
  return button;
}
