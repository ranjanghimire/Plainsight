export function NoteList({
  archiveMode,
  subtitle,
  onArchiveClearAll,
  isEmpty,
  emptyText,
  children,
  listGridHidden = false,
  emptyIntro = false,
  /** Extra classes on the root (e.g. flex-1 so swipe/touch fills space below category chips). */
  rootClassName = '',
}) {
  return (
    <div
      className={`
        rounded-lg transition-opacity duration-200 ease-out
        ${archiveMode ? 'bg-neutral-50 dark:bg-neutral-900 px-3 py-4 -mx-1' : ''}
        ${rootClassName}
      `}
    >
      {archiveMode && subtitle ? (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 min-w-0" aria-hidden />
          <p className="text-center text-sm text-neutral-500 dark:text-neutral-500 shrink-0 max-w-[min(100%,calc(100%-5.5rem))] px-1">
            {subtitle}
          </p>
          <div className="flex-1 flex justify-end min-w-0">
            {onArchiveClearAll ? (
              <button
                type="button"
                onClick={onArchiveClearAll}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-300 underline decoration-neutral-400/70 hover:decoration-neutral-700 dark:hover:decoration-neutral-400 underline-offset-2"
              >
                Clear All
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={`grid gap-3 transition-opacity duration-150 ease-out ${
          listGridHidden ? 'opacity-0' : 'opacity-100'
        } ${isEmpty ? '' : 'min-h-0 flex-1'}`}
      >
        {children}
      </div>
      {isEmpty ? (
        <div className="flex min-h-[min(18rem,55dvh)] flex-1 flex-col items-center justify-center py-6">
          <p
            className={`text-neutral-500 dark:text-neutral-500 text-sm text-center transition-opacity duration-200 ease-out ${
              emptyIntro ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {emptyText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
