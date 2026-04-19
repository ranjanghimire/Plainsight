import { createPortal } from 'react-dom';

export function ContextActionPopover({
  open,
  entered,
  x,
  y,
  showRename = true,
  showDelete,
  showShare = false,
  showLogs = false,
  showMakePrivate = false,
  renameLabel = 'Rename',
  deleteLabel = 'Delete',
  shareLabel = 'Share',
  logsLabel = 'Logs',
  makePrivateLabel = 'Make private',
  onRename,
  onDelete,
  onShare,
  onLogs,
  onMakePrivate,
  onDismiss,
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] cursor-default bg-transparent"
        aria-label="Dismiss menu"
        onClick={onDismiss}
      />
      <div
        role="menu"
        className={`
          fixed z-[101] min-w-[9.5rem] py-1 rounded-lg border border-stone-200/90
          bg-white/90 backdrop-blur-sm shadow-lg dark:border-stone-600/90 dark:bg-black/80
          transition-all duration-[135ms] ease-out origin-top-left
          ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {showRename ? (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-700/80"
            onClick={() => {
              onRename?.();
              onDismiss();
            }}
          >
            {renameLabel}
          </button>
        ) : null}
        {showShare ? (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-700/80"
            onClick={() => {
              onShare?.();
              onDismiss();
            }}
          >
            {shareLabel}
          </button>
        ) : null}
        {showLogs ? (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-700/80"
            onClick={() => {
              onLogs?.();
              onDismiss();
            }}
          >
            {logsLabel}
          </button>
        ) : null}
        {showMakePrivate ? (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-700/80"
            onClick={() => {
              onMakePrivate?.();
              onDismiss();
            }}
          >
            {makePrivateLabel}
          </button>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              onDelete();
              onDismiss();
            }}
          >
            {deleteLabel}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
