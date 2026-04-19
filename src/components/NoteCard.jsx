import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTagsNav } from '../context/TagsNavContext';
import { CategoryDropdown } from './CategoryDropdown';
import { formatNoteDate } from '../utils/formatDate';
import { composeNoteWithTags, parseNoteBodyAndTags } from '../utils/noteTags';
import { useNoteFormatModes } from '../hooks/useNoteFormatModes.jsx';
import { useFloatingSubmitTopPx } from '../hooks/useVisualViewportBottomInset.js';
import { NoteFormatPopover, FloatingNoteSubmit } from './noteFormat/NoteFormatPopover.jsx';

const ACTIVE_DELETE_MS = 180;
const ARCHIVE_DELETE_MS = 170;

/**
 * Bold changes glyph metrics; keep shared indent / `- ` prefix in normal weight so
 * later bullet lines align with the first line in display mode.
 */
function splitFirstLineForBoldDisplay(firstLine) {
  const bulletLead = firstLine.match(/^(\s*-\s*)/);
  if (bulletLead) {
    return { lead: bulletLead[1], bold: firstLine.slice(bulletLead[1].length) };
  }
  const spaceLead = firstLine.match(/^(\s*)/);
  const lead = spaceLead ? spaceLead[1] : '';
  return { lead, bold: firstLine.slice(lead.length) };
}

/** Matches composer `DEFAULT_BULLET_INDENT` in useNoteFormatModes.jsx */
const BULLET_DISPLAY_INDENT = '  ';

/**
 * First bullet line is often stored as "- item" (hyphen at text column 0) while Enter inserts "  - " on
 * the next line — normalize for display so columns line up with existing notes.
 */
function normalizeBulletDisplayLine(line) {
  const t = line.replace(/\r/g, '');
  if (/^\s+-\s/.test(t)) return t;
  if (/^-\s/.test(t)) return `${BULLET_DISPLAY_INDENT}${t}`;
  return t;
}

/** Filled disc shown in read-only note body; editor still uses `-`. */
function BulletGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <circle cx="6" cy="6" r="1.85" />
    </svg>
  );
}

/** Small, muted; `align-middle` centers with text cap-height without heavy translate hacks. */
const BULLET_GLYPH_CLASS =
  'inline-block shrink-0 align-middle h-[0.58em] w-[0.58em] text-stone-400 opacity-75 dark:text-stone-500';

/** Replace stored `- ` bullet marker with a disc for display only. */
function renderDisplayLineVisual(line) {
  if (line.length === 0) return '\u00a0';
  const m = line.match(/^(\s*)-\s*(.*)$/);
  if (!m) return line;
  const [, indent, rest] = m;
  return (
    <>
      {indent}
      <BulletGlyph className={BULLET_GLYPH_CLASS} />
      {rest ? <> {rest}</> : null}
    </>
  );
}

function renderBoldLeadVisual(lead) {
  if (!lead) return null;
  const m = lead.match(/^(\s*)-\s*$/);
  if (m) {
    return (
      <>
        <span className="font-normal">{m[1]}</span>
        <BulletGlyph className={BULLET_GLYPH_CLASS} />
      </>
    );
  }
  return <span className="font-normal">{lead}</span>;
}

/** One block per source line so soft-wrap cannot borrow the next line’s horizontal origin (fixes bullet column drift). */
const DISPLAY_LINE_BLOCK =
  'block w-full whitespace-pre-wrap break-words font-normal text-left';

function renderNoteDisplayBody(displayBody, boldFirst) {
  const lines = displayBody
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeBulletDisplayLine);
  return lines.map((line, i) => {
    if (boldFirst && i === 0) {
      const { lead, bold } = splitFirstLineForBoldDisplay(line);
      return (
        <span key={i} className={DISPLAY_LINE_BLOCK}>
          {renderBoldLeadVisual(lead)}
          {bold ? <span className="font-semibold">{bold}</span> : null}
        </span>
      );
    }
    return (
      <span key={i} className={DISPLAY_LINE_BLOCK}>
        {renderDisplayLineVisual(line)}
      </span>
    );
  });
}

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
  const textareaRef = useRef(null);
  const cardShellRef = useRef(null);
  const commitFnRef = useRef(() => {});
  const [textareaFocused, setTextareaFocused] = useState(false);
  const floatingSubmitTopPx = useFloatingSubmitTopPx();

  const {
    boldMode,
    setBoldMode,
    bulletsMode,
    setBulletsMode,
    newlineMode,
    popoverExpanded,
    openPopover,
    closePopover,
    handleTextareaKeyDown,
    toggleBullets,
    resetFormatModes,
  } = useNoteFormatModes({
    searchMode: false,
    onCommit: () => commitFnRef.current(),
  });

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

  useEffect(() => {
    if (isEditing) setBoldMode(Boolean(note.boldFirstLine));
  }, [isEditing, note.id, note.boldFirstLine, setBoldMode]);

  const commitText = useCallback(() => {
    const { tags } = parseNoteBodyAndTags(note.text);
    const full = composeNoteWithTags(tags, editBody);
    if (isArchived) {
      if (full !== note.text) {
        onArchivedUpdate?.(archivedEditKeyRef.current, { text: full });
      }
      setIsEditing(false);
      resetFormatModes();
      return;
    }
    const updates = {};
    if (full !== note.text) updates.text = full;
    if (Boolean(note.boldFirstLine) !== Boolean(boldMode)) updates.boldFirstLine = boldMode;
    if (Object.keys(updates).length > 0) onUpdate(note.id, updates);
    setIsEditing(false);
    resetFormatModes();
  }, [boldMode, editBody, isArchived, note.boldFirstLine, note.id, note.text, onArchivedUpdate, onUpdate, resetFormatModes]);

  commitFnRef.current = commitText;

  const handleTextareaBlur = useCallback(
    (e) => {
      requestAnimationFrame(() => setTextareaFocused(false));
      const rt = typeof e.relatedTarget === 'string' ? null : e.relatedTarget;
      if (rt instanceof Node && cardShellRef.current?.contains(rt)) return;
      commitText();
    },
    [commitText],
  );

  const setEditBodyFromFormat = useCallback((next) => {
    setEditBody(String(next ?? ''));
  }, []);

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

  /** Read-only body: per-line blocks + `px-2 text-base` to match the editor textarea (no bold-only assumptions). */
  const displayBodyParaClass = isArchived
    ? 'text-neutral-700 dark:text-neutral-300 cursor-pointer min-h-[1.5em] touch-manipulation px-2 text-base font-normal'
    : 'text-stone-700 dark:text-stone-300 cursor-pointer min-h-[1.5em] touch-manipulation px-2 text-base font-normal';

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

  const displayBody = parsed.body;
  const displayBoldFirst = Boolean(note.boldFirstLine);

  return (
    <div className={outerWrapClass}>
      <div
        ref={cardShellRef}
        className={`${shellBase} ${shellPad} ${shellTransition} ${archiveAnimating ? 'animate-plainsight-restore-out' : ''}`}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => {
              setEditBody(e.target.value);
            }}
            onBlur={handleTextareaBlur}
            onFocus={() => setTextareaFocused(true)}
            onKeyDown={(e) => {
              handleTextareaKeyDown(e, textareaRef.current, editBody, setEditBodyFromFormat);
            }}
            className={
              isArchived
                ? 'w-full min-h-[80px] px-2 py-1.5 text-base text-neutral-800 bg-neutral-50 rounded border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-900 dark:border-neutral-600 dark:text-neutral-200 dark:focus:ring-neutral-600'
                : 'w-full min-h-[80px] px-2 py-1.5 text-base text-stone-800 bg-stone-50 rounded border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-200'
            }
            autoFocus
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={handleTextBodyPointerPick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTextBodyPointerPick();
              }
            }}
            className={displayBody ? displayBodyParaClass : bodyTextClass}
          >
            {displayBody ? renderNoteDisplayBody(displayBody, displayBoldFirst) : 'Double-click or double-tap to edit…'}
          </div>
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

            {parsed.tags.length > 0 || isEditing ? (
              <div
                className={`flex min-w-0 items-stretch gap-1 pt-2 transition-opacity duration-150 ease-out ${
                  showMetaRow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                {parsed.tags.length > 0 ? (
                  <TagRowIcon
                    className={
                      isArchived
                        ? 'w-3.5 h-3.5 shrink-0 self-start text-neutral-400 dark:text-neutral-500 mt-0.5'
                        : 'w-3.5 h-3.5 shrink-0 self-start text-stone-400 dark:text-stone-500 mt-0.5'
                    }
                  />
                ) : isEditing ? (
                  <span className="w-3.5 shrink-0 self-start" aria-hidden />
                ) : null}
                <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-center gap-1 self-center">
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
                {isEditing ? (
                  <NoteFormatPopover
                    expanded={popoverExpanded}
                    onOpen={openPopover}
                    onClose={closePopover}
                    boldMode={boldMode}
                    onBoldChange={setBoldMode}
                    bulletsMode={bulletsMode}
                    onBulletsChange={setBulletsMode}
                    textareaRef={textareaRef}
                    value={editBody}
                    setValue={setEditBodyFromFormat}
                    toggleBullets={toggleBullets}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isEditing ? (
        <FloatingNoteSubmit
          visible={newlineMode && textareaFocused}
          topPx={floatingSubmitTopPx}
          onClick={commitText}
          disabled={false}
        />
      ) : null}
    </div>
  );
}
