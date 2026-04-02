import { useState, useRef, useEffect } from 'react';
import { CategoryDropdown } from './CategoryDropdown';
import { formatNoteDate } from '../utils/formatDate';

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

export function NoteCard({
  note,
  categories,
  onUpdate,
  onDelete,
  onAddCategory,
  variant = 'active',
  onRestore,
  onArchivedUpdate,
  onPermanentDeleteArchived,
  archiveAnimating = false,
}) {
  const [text, setText] = useState(note.text);
  const [isEditing, setIsEditing] = useState(false);
  const [metaVisible, setMetaVisible] = useState(false);
  const toggleEditTimerRef = useRef(null);
  const archivedEditKeyRef = useRef(note.text);

  const isArchived = variant === 'archived';

  useEffect(() => {
    return () => {
      if (toggleEditTimerRef.current) clearTimeout(toggleEditTimerRef.current);
    };
  }, []);

  const commitText = () => {
    if (isArchived) {
      if (text !== note.text) {
        onArchivedUpdate?.(archivedEditKeyRef.current, { text });
      }
      setIsEditing(false);
      return;
    }
    if (text !== note.text) onUpdate(note.id, { text });
    setIsEditing(false);
  };

  /** Single activate toggles meta; second activate within window opens editor (mouse dblclick + touch double-tap). */
  const handleTextBodyPointerPick = () => {
    if (toggleEditTimerRef.current !== null) {
      clearTimeout(toggleEditTimerRef.current);
      toggleEditTimerRef.current = null;
      if (isArchived) archivedEditKeyRef.current = note.text;
      setIsEditing(true);
      return;
    }
    toggleEditTimerRef.current = setTimeout(() => {
      toggleEditTimerRef.current = null;
      setMetaVisible((v) => !v);
    }, 280);
  };

  const showMetaRow = metaVisible || isEditing;

  const shellBase = isArchived
    ? 'rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-600 px-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
    : 'rounded-lg border border-stone-200 bg-white px-3 shadow-sm dark:border-stone-600 dark:bg-stone-800';
  const shellPad = showMetaRow ? 'py-4' : 'py-2';
  const shellTransition = 'transition-all duration-200 ease-out';

  const bodyTextClass = isArchived
    ? 'text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap cursor-pointer min-h-[1.5em] touch-manipulation'
    : 'text-stone-700 dark:text-stone-300 whitespace-pre-wrap cursor-pointer min-h-[1.5em] touch-manipulation';

  const deletedAtIso =
    note.lastDeletedAt != null
      ? new Date(note.lastDeletedAt).toISOString()
      : null;

  return (
    <div
      className={`${shellBase} ${shellPad} ${shellTransition} ${archiveAnimating ? 'animate-plainsight-restore-out' : ''}`}
    >
      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            }
          }}
          className={
            isArchived
              ? 'w-full min-h-[80px] px-2 py-1.5 text-base text-neutral-800 bg-neutral-50 rounded border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-900 dark:border-neutral-600 dark:text-neutral-200 dark:focus:ring-neutral-600'
              : 'w-full min-h-[80px] px-2 py-1.5 text-base text-stone-800 bg-stone-50 rounded border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-200'
          }
          autoFocus
        />
      ) : (
        <p onClick={handleTextBodyPointerPick} className={bodyTextClass}>
          {text || 'Double-click or double-tap to edit…'}
        </p>
      )}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${showMetaRow ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        {/* overflow-hidden only when collapsed so 0fr rows don’t leak; visible when open so CategoryDropdown isn’t clipped */}
        <div className={`min-h-0 ${showMetaRow ? 'overflow-visible' : 'overflow-hidden'}`}>
          <div
            className={`flex items-center justify-between gap-2 pt-2 transition-opacity duration-150 ease-out ${
              showMetaRow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <CategoryDropdown
              categories={categories}
              currentCategory={note.category}
              onSelect={(cat) =>
                isArchived
                  ? onArchivedUpdate?.(note.text, { category: cat })
                  : onUpdate(note.id, { category: cat })
              }
              onAddNew={onAddCategory}
              triggerLabel="+Add category"
            />
            {isArchived && deletedAtIso ? (
              <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
                {formatNoteDate(deletedAtIso)}
              </span>
            ) : null}
            {!isArchived && note.createdAt ? (
              <span className="text-xs text-stone-400 dark:text-stone-500 shrink-0">
                {formatNoteDate(note.createdAt)}
              </span>
            ) : null}
            {isArchived ? (
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onRestore?.(note.text)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  aria-label="Restore note"
                >
                  <RestoreIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onPermanentDeleteArchived?.(note.text)}
                  className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Delete archived note permanently"
                >
                  <TrashIcon />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onDelete(note.id)}
                className="p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400"
                aria-label="Delete note"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
