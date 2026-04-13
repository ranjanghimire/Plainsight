import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTagsNav } from '../context/TagsNavContext';
import { CategoryDropdown } from './CategoryDropdown';
import { formatNoteDate } from '../utils/formatDate';
import { composeNoteWithTags, parseNoteBodyAndTags } from '../utils/noteTags';

const ACTIVE_DELETE_MS = 180;
const ARCHIVE_DELETE_MS = 170;

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function TagRowIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg
      className={`${className} block translate-y-px`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M7 7h.01M3 11l8.5 8.5a2 2 0 002.828 0L21 12.828a2 2 0 000-2.828L13.5 2.5A2 2 0 0012.086 2H5a2 2 0 00-2 2v7.086A2 2 0 003 11z"
      />
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
  bulkDissolve = false,
}) {
  const location = useLocation();
  const { openTagsPage } = useTagsNav();
  const parsed = useMemo(() => parseNoteBodyAndTags(note.text), [note.text]);
  const [editBody, setEditBody] = useState(() => parsed.body);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [metaVisible, setMetaVisible] = useState(false);
  const toggleEditTimerRef = useRef(null);
  const archivedEditKeyRef = useRef(note.text);
  const deleteTimerRef = useRef(null);

  const isArchived = variant === 'archived';

  useEffect(() => {
    if (!isEditing) {
      setEditBody(parsed.body);
    }
  }, [parsed.body, isEditing]);

  useEffect(() => {
    return () => {
      if (toggleEditTimerRef.current) clearTimeout(toggleEditTimerRef.current);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const commitText = () => {
    const { tags } = parseNoteBodyAndTags(note.text);
    const full = composeNoteWithTags(tags, editBody);
    if (isArchived) {
      if (full !== note.text) {
        onArchivedUpdate?.(archivedEditKeyRef.current, { text: full });
      }
      setIsEditing(false);
      return;
    }
    if (full !== note.text) onUpdate(note.id, { text: full });
    setIsEditing(false);
  };

  /** Single activate toggles meta; second activate within window opens editor (mouse dblclick + touch double-tap). */
  const handleTextBodyPointerPick = () => {
    if (bulkDissolve || isDeleting) return;
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
  /** Avoid `transition-all` so layout reflows (e.g. after category swipe) do not animate card width. */
  const shellTransition =
    'transition-[padding-top,padding-bottom,opacity,transform,box-shadow,border-color,background-color] duration-200 ease-out';

  const bodyTextClass = isArchived
    ? 'text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap cursor-pointer min-h-[1.5em] touch-manipulation'
    : 'text-stone-700 dark:text-stone-300 whitespace-pre-wrap cursor-pointer min-h-[1.5em] touch-manipulation';

  const deletedAtIso =
    note.lastDeletedAt != null
      ? new Date(note.lastDeletedAt).toISOString()
      : null;

  const outerWrapClass = bulkDissolve
    ? 'transition-opacity duration-[180ms] ease-out opacity-0 pointer-events-none'
    : isDeleting && isArchived
      ? 'transition-[opacity,transform] duration-[170ms] ease-out opacity-0 scale-95 pointer-events-none'
      : isDeleting && !isArchived
        ? 'transition-[opacity,transform,max-height] duration-200 ease-out opacity-0 translate-y-[4px] max-h-0 overflow-hidden pointer-events-none'
        : 'transition-[opacity,transform,max-height] duration-200 ease-out opacity-100 translate-y-0 max-h-[999px] overflow-visible scale-100';

  const handleDeleteActive = () => {
    if (isDeleting || bulkDissolve) return;
    setIsDeleting(true);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onDelete(note.id);
    }, ACTIVE_DELETE_MS);
  };

  const handlePermanentDeleteArchived = () => {
    if (isDeleting || bulkDissolve) return;
    setIsDeleting(true);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onPermanentDeleteArchived?.(note.text);
    }, ARCHIVE_DELETE_MS);
  };

  return (
    <div className={outerWrapClass}>
      <div
        className={`${shellBase} ${shellPad} ${shellTransition} ${archiveAnimating ? 'animate-plainsight-restore-out' : ''}`}
      >
        {isEditing ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
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
            {parsed.body || 'Double-click or double-tap to edit…'}
          </p>
        )}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${showMetaRow ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
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
                    disabled={bulkDissolve || isDeleting}
                    className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 disabled:opacity-40"
                    aria-label="Restore note"
                  >
                    <RestoreIcon />
                  </button>
                  <button
                    type="button"
                    onClick={handlePermanentDeleteArchived}
                    disabled={bulkDissolve || isDeleting}
                    className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                    aria-label="Delete archived note permanently"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDeleteActive}
                  disabled={isDeleting}
                  className="p-1.5 text-stone-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                  aria-label="Delete note"
                >
                  <TrashIcon />
                </button>
              )}
            </div>

            {parsed.tags.length > 0 ? (
              <div
                className={`flex items-start gap-1.5 pt-2 transition-opacity duration-150 ease-out ${
                  showMetaRow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                <TagRowIcon
                  className={
                    isArchived
                      ? 'w-3.5 h-3.5 shrink-0 text-neutral-400 dark:text-neutral-500 mt-0.5'
                      : 'w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-stone-500 mt-0.5'
                  }
                />
                <div className="flex flex-wrap gap-1 min-w-0">
                  {parsed.tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTagsPage({
                          expandTag: t,
                          tagsReturnTo: {
                            pathname: location.pathname,
                            search: location.search,
                            hash: location.hash,
                          },
                        });
                      }}
                      aria-label={`Open tags for ${t}`}
                      className={
                        isArchived
                          ? 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-neutral-200/80 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200 hover:bg-neutral-300/90 dark:hover:bg-neutral-600 cursor-pointer transition-colors'
                          : 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-600 cursor-pointer transition-colors'
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
