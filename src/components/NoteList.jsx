export function NoteList({
  archiveMode,
  subtitle,
  onArchiveClearAll,
  isEmpty,
  emptyText,
  children,
}) {
  return (
    <div
      className={`
        rounded-lg transition-opacity duration-200 ease-out
        ${archiveMode ? 'bg-neutral-50 dark:bg-neutral-900 px-3 py-4 -mx-1' : ''}
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
      <div className="grid gap-3">{children}</div>
      {isEmpty ? (
        <p className="text-neutral-500 dark:text-neutral-500 text-sm py-4 text-center">
          {emptyText}
        </p>
      ) : null}
    </div>
  );
}
