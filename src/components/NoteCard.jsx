import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTagsNav } from '../context/TagsNavContext';
import { CategoryDropdown } from './CategoryDropdown';
import { formatNoteDate } from '../utils/formatDate';
import {
  composeNoteWithTags,
  normalizeTagDraftInput,
  parseNoteBodyAndTags,
  parseTagsFromDraft,
  tagsToTagDraft,
  trimTrailingBlankLines,
} from '../utils/noteTags';
import { toggleCheckboxLineInBody } from '../utils/checkboxNoteLines.js';
import { useNoteFormatModes } from '../hooks/useNoteFormatModes.jsx';
import { useFloatingSubmitTopPx } from '../hooks/useVisualViewportBottomInset.js';
import { NoteFormatPopover, FloatingNoteSubmit } from './noteFormat/NoteFormatPopover.jsx';

const ACTIVE_DELETE_MS = 180;
const ARCHIVE_DELETE_MS = 170;

/** Logical newline count above which read-only body collapses with show more / less. */
const READ_MORE_LINE_THRESHOLD = 7;

/** Keep the caret line inside the textarea viewport (esp. after Enter on the last line). */
function scrollNoteTextareaCaretIntoView(ta) {
  if (!ta) return;
  try {
    ta.scrollTop = Math.max(0, ta.scrollHeight - ta.clientHeight);
  } catch {
    /* ignore */
  }
}

/**
 * Bold changes glyph metrics; keep shared indent / `- ` prefix in normal weight so
 * later bullet lines align with the first line in display mode.
 */
function splitFirstLineForBoldDisplay(firstLine) {
  const checkboxLead = firstLine.match(/^(\s*\[( |x|X)\]\s*)/);
  if (checkboxLead) {
    return { lead: checkboxLead[1], bold: firstLine.slice(checkboxLead[1].length) };
  }
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
function normalizeListDisplayLine(line) {
  const t = line.replace(/\r/g, '');
  if (/^\s+\[( |x|X)\]\s/.test(t)) return t;
  if (/^\[( |x|X)\]\s/.test(t)) return `${BULLET_DISPLAY_INDENT}${t}`;
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

/** Compact control aligned to cap-height; outer padding preserves a comfortable tap target. */
const CHECKBOX_OUTER_CLASS =
  'inline-flex shrink-0 select-none touch-manipulation align-middle rounded-md p-[0.28em] -m-[0.28em] [-webkit-tap-highlight-color:transparent] transition-opacity duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/25 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent disabled:opacity-40';

const CHECKBOX_BOX_CLASS =
  'flex h-[0.68em] w-[0.68em] shrink-0 items-center justify-center rounded-[2.5px] border transition-[background-color,border-color,box-shadow,color] duration-150 ease-out shadow-[0_0.5px_1px_rgba(28,25,23,0.06)] dark:shadow-[0_0.5px_1px_rgba(0,0,0,0.35)]';

function CheckboxDisplayGlyph({ checked, disabled, onToggle }) {
  const boxClass = checked
    ? `${CHECKBOX_BOX_CLASS} border-neutral-800/90 bg-neutral-800 text-neutral-50 shadow-none dark:border-neutral-100/90 dark:bg-neutral-100 dark:text-neutral-900`
    : `${CHECKBOX_BOX_CLASS} border-current/25 bg-white/90 text-current dark:bg-black/20`;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={CHECKBOX_OUTER_CLASS}
      aria-label={checked ? 'Mark item not done' : 'Mark item done'}
      aria-pressed={checked}
    >
      <span className={boxClass} aria-hidden>
        {checked ? (
          <svg
            className="h-[0.42em] w-[0.42em] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 12.5l3.5 3.5 7.5-8.5" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

/** Replace stored `- ` bullet marker with a disc for display only. */
function renderDisplayLineVisual(line, lineIndex, onCheckboxToggle, checkboxDisabled) {
  if (line.length === 0) return '\u00a0';
  const cb = line.match(/^(\s*)\[( |x|X)\]\s*(.*)$/);
  if (cb) {
    const [, indent, mark, rest] = cb;
    const checked = mark === 'x' || mark === 'X';
    return (
      <>
        {indent}
        <CheckboxDisplayGlyph
          checked={checked}
          disabled={checkboxDisabled}
          onToggle={() => onCheckboxToggle?.(lineIndex)}
        />
        {rest ? <> {rest}</> : null}
      </>
    );
  }
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

function renderBoldLeadVisual(lead, onToggleFirstLineCheckbox, checkboxDisabled) {
  if (!lead) return null;
  const cb = lead.match(/^(\s*)\[( |x|X)\]\s*$/);
  if (cb) {
    const checked = cb[2] === 'x' || cb[2] === 'X';
    return (
      <>
        <span className="font-normal">{cb[1]}</span>
        <CheckboxDisplayGlyph
          checked={checked}
          disabled={checkboxDisabled}
          onToggle={() => onToggleFirstLineCheckbox?.()}
        />
      </>
    );
  }
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

/** Extra space under a bold first line before line 2+ (semibold reads cramped without it). */
const BOLD_FIRST_LINE_AFTER_GAP = 'mb-1.5';

function renderNoteDisplayBody(displayBody, boldFirst, onCheckboxToggle, checkboxDisabled) {
  const lines = displayBody
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeListDisplayLine);
  const boldFirstHasMoreLines = Boolean(boldFirst && lines.length > 1);
  return lines.map((line, i) => {
    if (boldFirst && i === 0) {
      const { lead, bold } = splitFirstLineForBoldDisplay(line);
      return (
        <span
          key={i}
          className={boldFirstHasMoreLines ? `${DISPLAY_LINE_BLOCK} ${BOLD_FIRST_LINE_AFTER_GAP}` : DISPLAY_LINE_BLOCK}
        >
          {renderBoldLeadVisual(lead, () => onCheckboxToggle?.(0), checkboxDisabled)}
          {bold ? <span className="font-semibold">{bold}</span> : null}
        </span>
      );
    }
    return (
      <span key={i} className={DISPLAY_LINE_BLOCK}>
        {renderDisplayLineVisual(line, i, onCheckboxToggle, checkboxDisabled)}
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

/** Same paper-plane stroke as SearchCommandBar “Add note” / FloatingNoteSubmit. */
function NoteCardSendIcon({ className = 'w-5 h-5' }) {
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

/** Return-to-list / restore (arrow U-turn), not a circular recycle arrow. */
function RestoreIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 15L3 9M3 9L9 3M3 9H15C18.3137 9 21 11.6863 21 15C21 18.3137 18.3137 21 15 21H12"
      />
    </svg>
  );
}

function PencilSquareIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

/** Double chevron down — read-more expand (muted; paired with ReadMoreCollapseIcon). */
function ReadMoreExpandIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M7 6l5 5 5-5M7 12l5 5 5-5"
      />
    </svg>
  );
}

/** Double chevron up — read-more collapse. */
function ReadMoreCollapseIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M7 18l5-5 5 5M7 12l5-5 5 5"
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
  const [editBody, setEditBody] = useState(() => trimTrailingBlankLines(parsed.body));
  const [tagDraft, setTagDraft] = useState(() => tagsToTagDraft(parsed.tags));
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [metaVisible, setMetaVisible] = useState(false);
  const [readMoreExpanded, setReadMoreExpanded] = useState(false);
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
    checklistMode,
    popoverExpanded,
    openPopover,
    closePopover,
    handleTextareaKeyDown,
    applyBulletLineToggle,
    applyCheckboxLineToggle,
    syncBulletsModeFromCaret,
    resetFormatModes,
  } = useNoteFormatModes({
    searchMode: false,
    defaultPopoverExpanded: true,
    onCommit: () => commitFnRef.current(),
  });

  const isArchived = variant === 'archived';

  useEffect(() => {
    if (!isEditing) {
      setEditBody(trimTrailingBlankLines(parsed.body));
      setTagDraft(tagsToTagDraft(parsed.tags));
    }
  }, [parsed.body, parsed.tags, isEditing]);

  useEffect(() => {
    return () => {
      if (toggleEditTimerRef.current) clearTimeout(toggleEditTimerRef.current);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isEditing) setBoldMode(Boolean(note.boldFirstLine));
  }, [isEditing, note.id, note.boldFirstLine, setBoldMode]);

  useEffect(() => {
    setReadMoreExpanded(false);
  }, [note.id, note.text]);

  /** After opening the editor, keep caret in view (textarea scroll + page scroll; mobile / tall min-height). */
  useLayoutEffect(() => {
    if (!isEditing) return;
    const ta = textareaRef.current;
    if (!ta) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try {
        ta.focus({ preventScroll: true });
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
        scrollNoteTextareaCaretIntoView(ta);
        ta.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        syncBulletsModeFromCaret(ta.value, ta);
      } catch {
        /* ignore */
      }
    };
    const id0 = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id0);
    };
  }, [isEditing, syncBulletsModeFromCaret]);

  useLayoutEffect(() => {
    if (!isEditing) return;
    const ta = textareaRef.current;
    if (!ta) return;
    syncBulletsModeFromCaret(editBody, ta);
  }, [isEditing, editBody, syncBulletsModeFromCaret]);

  const commitText = useCallback(() => {
    const tags = parseTagsFromDraft(tagDraft);
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
  }, [
    boldMode,
    editBody,
    isArchived,
    note.boldFirstLine,
    note.id,
    note.text,
    onArchivedUpdate,
    onUpdate,
    resetFormatModes,
    tagDraft,
  ]);

  commitFnRef.current = commitText;

  const commitIfFocusLeftCard = useCallback(
    (e) => {
      const rt = typeof e.relatedTarget === 'string' ? null : e.relatedTarget;
      if (rt instanceof Node && cardShellRef.current?.contains(rt)) return;
      commitText();
    },
    [commitText],
  );

  const handleTextareaBlur = useCallback(
    (e) => {
      requestAnimationFrame(() => setTextareaFocused(false));
      commitIfFocusLeftCard(e);
    },
    [commitIfFocusLeftCard],
  );

  const handleTagRowInputBlur = useCallback(
    (e) => {
      commitIfFocusLeftCard(e);
    },
    [commitIfFocusLeftCard],
  );

  const setEditBodyFromFormat = useCallback((next) => {
    setEditBody(String(next ?? ''));
  }, []);

  const openEditor = useCallback(() => {
    if (bulkDissolve || isDeleting || isArchived) return;
    if (toggleEditTimerRef.current !== null) {
      clearTimeout(toggleEditTimerRef.current);
      toggleEditTimerRef.current = null;
    }
    archivedEditKeyRef.current = note.text;
    setEditBody(trimTrailingBlankLines(parsed.body));
    setTagDraft(tagsToTagDraft(parsed.tags));
    setIsEditing(true);
  }, [bulkDissolve, isArchived, isDeleting, note.text, parsed.body, parsed.tags]);

  /** Single activate toggles meta; second activate within window opens editor (mouse dblclick + touch double-tap). Archived: meta only, never edit. */
  const handleTextBodyPointerPick = () => {
    if (bulkDissolve || isDeleting) return;
    if (isArchived) {
      if (toggleEditTimerRef.current !== null) {
        clearTimeout(toggleEditTimerRef.current);
        toggleEditTimerRef.current = null;
      }
      setMetaVisible((v) => !v);
      return;
    }
    if (toggleEditTimerRef.current !== null) {
      clearTimeout(toggleEditTimerRef.current);
      toggleEditTimerRef.current = null;
      openEditor();
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
        : 'min-w-0 max-w-full transition-[opacity,transform,max-height] duration-200 ease-out opacity-100 translate-y-0 max-h-[999px] overflow-visible scale-100';

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

  const { displayBody, displayLineCount } = useMemo(() => {
    const b = trimTrailingBlankLines(parsed.body);
    return { displayBody: b, displayLineCount: b ? b.split('\n').length : 0 };
  }, [parsed.body]);
  const displayBoldFirst = Boolean(note.boldFirstLine);
  const readMoreActive = Boolean(displayBody && displayLineCount > READ_MORE_LINE_THRESHOLD);

  const checkboxToggleDisabled = isDeleting || bulkDissolve || isArchived;

  const handleDisplayCheckboxToggle = useCallback(
    (lineIndex) => {
      if (checkboxToggleDisabled) return;
      const nextBody = toggleCheckboxLineInBody(displayBody, lineIndex);
      if (nextBody === displayBody) return;
      const full = composeNoteWithTags(parsed.tags, nextBody);
      if (full === note.text) return;
      if (isArchived) {
        onArchivedUpdate?.(note.text, { text: full });
      } else {
        onUpdate?.(note.id, { text: full });
      }
    },
    [
      checkboxToggleDisabled,
      displayBody,
      isArchived,
      note.id,
      note.text,
      onArchivedUpdate,
      onUpdate,
      parsed.tags,
    ],
  );

  return (
    <div className={outerWrapClass}>
      <div
        ref={cardShellRef}
        className={`${shellBase} ${shellPad} ${shellTransition} min-w-0 max-w-full ${archiveAnimating ? 'animate-plainsight-restore-out' : ''}`}
      >
        {isEditing ? (
          <div
            className={
              isArchived
                ? 'flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 focus-within:border-neutral-300 focus-within:ring-2 focus-within:ring-neutral-300 dark:border-neutral-600 dark:bg-neutral-900 dark:focus-within:border-neutral-500 dark:focus-within:ring-neutral-600'
                : 'flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-stone-50 focus-within:border-stone-300 focus-within:ring-2 focus-within:ring-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:focus-within:border-stone-500 dark:focus-within:ring-stone-600'
            }
          >
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden px-2 pt-1.5">
              <textarea
                ref={textareaRef}
                value={editBody}
                rows={4}
                onChange={(e) => {
                  setEditBody(e.target.value);
                }}
                onBlur={handleTextareaBlur}
                onFocus={() => {
                  setTextareaFocused(true);
                  openPopover();
                }}
                onKeyDown={(e) => {
                  handleTextareaKeyDown(e, textareaRef.current, editBody, setEditBodyFromFormat);
                  if (e.key === 'Enter' && !e.shiftKey) {
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => scrollNoteTextareaCaretIntoView(textareaRef.current));
                    });
                  }
                }}
                onKeyUp={(e) => {
                  const ta = e.currentTarget;
                  syncBulletsModeFromCaret(ta.value, ta);
                }}
                onSelect={(e) => {
                  const ta = e.currentTarget;
                  syncBulletsModeFromCaret(ta.value, ta);
                }}
                className={
                  isArchived
                    ? 'min-h-[6rem] max-h-[min(70vh,32rem)] w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden break-words rounded-none border-0 bg-transparent py-1.5 pb-8 text-base text-neutral-800 caret-neutral-900 focus:outline-none focus:ring-0 dark:text-neutral-200 dark:caret-neutral-100'
                    : 'min-h-[6rem] max-h-[min(70vh,32rem)] w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden break-words rounded-none border-0 bg-transparent py-1.5 pb-8 text-base text-stone-800 caret-stone-900 focus:outline-none focus:ring-0 dark:text-stone-200 dark:caret-stone-100'
                }
                autoFocus
              />
              <button
                type="button"
                aria-label="Save note"
                disabled={bulkDissolve || isDeleting}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  commitText();
                }}
                className={
                  isArchived
                    ? 'shrink-0 rounded-lg bg-neutral-200/90 p-2 text-neutral-600 transition-colors hover:bg-neutral-300/95 disabled:pointer-events-none disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600'
                    : 'shrink-0 rounded-lg bg-stone-100 p-2 text-stone-600 transition-colors hover:bg-stone-200 disabled:pointer-events-none disabled:opacity-40 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600'
                }
              >
                <NoteCardSendIcon />
              </button>
            </div>
            <div
              className={
                isArchived
                  ? 'flex min-w-0 max-w-full items-stretch gap-1.5 overflow-hidden border-t border-neutral-200 px-2 py-2 text-neutral-500 dark:border-neutral-600 dark:text-neutral-400'
                  : 'flex min-w-0 max-w-full items-stretch gap-1.5 overflow-hidden border-t border-stone-200 px-2 py-2 text-stone-500 dark:border-stone-600 dark:text-stone-400'
              }
            >
              <div className="flex min-h-0 min-w-0 flex-1 items-center gap-0 overflow-hidden">
                <span className="shrink-0 select-none pr-0 text-sm leading-none" aria-hidden>
                  #
                </span>
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(normalizeTagDraftInput(e.target.value))}
                  onFocus={() => closePopover()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      textareaRef.current?.focus();
                      return;
                    }
                    if (e.key !== ' ' && e.key !== 'Spacebar') return;
                    e.preventDefault();
                    const input = e.currentTarget;
                    const start = input.selectionStart ?? tagDraft.length;
                    const end = input.selectionEnd ?? tagDraft.length;
                    const before = tagDraft.slice(0, start);
                    const after = tagDraft.slice(end);
                    if (/\s#\s*$/.test(before)) return;
                    const insert = ' #';
                    const next = `${before}${insert}${after}`;
                    setTagDraft(next);
                    const newPos = start + insert.length;
                    requestAnimationFrame(() => {
                      try {
                        input.setSelectionRange(newPos, newPos);
                      } catch {
                        /* ignore */
                      }
                    });
                  }}
                  onBlur={handleTagRowInputBlur}
                  placeholder="tag"
                  className={
                    isArchived
                      ? 'min-w-0 flex-1 bg-transparent pl-0 text-sm text-neutral-700 placeholder-neutral-400 focus:outline-none dark:text-neutral-200 dark:placeholder-neutral-500'
                      : 'min-w-0 flex-1 bg-transparent pl-0 text-sm text-stone-700 placeholder-stone-400 focus:outline-none dark:text-stone-200 dark:placeholder-stone-500'
                  }
                  aria-label="Tags"
                />
              </div>
              <NoteFormatPopover
                expanded={popoverExpanded}
                onOpen={openPopover}
                onClose={closePopover}
                boldMode={boldMode}
                onBoldChange={setBoldMode}
                bulletsMode={bulletsMode}
                checklistMode={checklistMode}
                textareaRef={textareaRef}
                value={editBody}
                setValue={setEditBodyFromFormat}
                applyBulletLineToggle={applyBulletLineToggle}
                applyCheckboxLineToggle={applyCheckboxLineToggle}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-stretch gap-0.5">
            <div className="min-w-0 flex-1">
              {displayBody ? (
                readMoreActive ? (
                  <div className={readMoreExpanded ? 'flex flex-col gap-0.5' : ''}>
                    <div
                      className={`relative overflow-hidden text-base leading-normal transition-[max-height] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-[max-height] motion-reduce:duration-200 ${
                        readMoreExpanded ? 'max-h-[min(120rem,9999px)]' : 'max-h-[10.5em]'
                      }`}
                    >
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
                        className={displayBodyParaClass}
                      >
                        {renderNoteDisplayBody(
                          displayBody,
                          displayBoldFirst,
                          handleDisplayCheckboxToggle,
                          checkboxToggleDisabled,
                        )}
                      </div>
                      {!readMoreExpanded ? (
                        <>
                          <div
                            className={`pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16 bg-gradient-to-t ${
                              isArchived
                                ? 'from-neutral-100 via-neutral-100/75 to-transparent dark:from-neutral-800 dark:via-neutral-800/75'
                                : 'from-white via-white/80 to-transparent dark:from-stone-800 dark:via-stone-800/80'
                            }`}
                            aria-hidden
                          />
                          <button
                            type="button"
                            aria-label="Show more"
                            className={
                              isArchived
                                ? 'absolute bottom-[1.1rem] left-1/2 z-[2] -translate-x-1/2 rounded-md p-1 text-neutral-400/50 opacity-80 transition-[color,opacity,transform] duration-300 ease-out hover:text-neutral-500/85 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/40 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:transform-none dark:text-neutral-500/40 dark:hover:text-neutral-400/80'
                                : 'absolute bottom-[1.1rem] left-1/2 z-[2] -translate-x-1/2 rounded-md p-1 text-stone-400/50 opacity-80 transition-[color,opacity,transform] duration-300 ease-out hover:text-stone-500/85 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400/40 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:transform-none dark:text-stone-500/40 dark:hover:text-stone-400/80'
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadMoreExpanded(true);
                            }}
                          >
                            <ReadMoreExpandIcon />
                          </button>
                        </>
                      ) : null}
                    </div>
                    {readMoreExpanded ? (
                      <button
                        type="button"
                        aria-label="Show less"
                        className={
                          isArchived
                            ? 'self-center rounded-md p-1 text-neutral-400/50 opacity-80 transition-[color,opacity,transform] duration-300 ease-out hover:text-neutral-500/85 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400/40 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:transform-none dark:text-neutral-500/40 dark:hover:text-neutral-400/80'
                            : 'self-center rounded-md p-1 text-stone-400/50 opacity-80 transition-[color,opacity,transform] duration-300 ease-out hover:text-stone-500/85 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400/40 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:transform-none dark:text-stone-500/40 dark:hover:text-stone-400/80'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setReadMoreExpanded(false);
                        }}
                      >
                        <ReadMoreCollapseIcon />
                      </button>
                    ) : null}
                  </div>
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
                    className={displayBodyParaClass}
                  >
                    {renderNoteDisplayBody(
                      displayBody,
                      displayBoldFirst,
                      handleDisplayCheckboxToggle,
                      checkboxToggleDisabled,
                    )}
                  </div>
                )
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
                  className={bodyTextClass}
                  aria-label={isArchived ? 'Archived note' : undefined}
                >
                  {isArchived ? '\u00a0' : 'Double-click or double-tap to edit…'}
                </div>
              )}
            </div>
            {!isArchived && showMetaRow ? (
              <div className="flex shrink-0 items-center self-stretch">
                <button
                  type="button"
                  aria-label="Edit note"
                  disabled={isDeleting || bulkDissolve}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor();
                  }}
                  className="shrink-0 rounded-md p-1.5 text-stone-400 transition-colors hover:text-stone-700 disabled:pointer-events-none disabled:opacity-40 dark:text-stone-500 dark:hover:text-stone-200"
                >
                  <PencilSquareIcon />
                </button>
              </div>
            ) : null}
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
              <div className="min-w-0 flex-1">
                {isArchived ? (
                  note.category ? (
                    <span className="block truncate text-xs font-medium text-neutral-600 dark:text-neutral-300">
                      {note.category}
                    </span>
                  ) : null
                ) : (
                  <CategoryDropdown
                    categories={categories}
                    currentCategory={note.category}
                    onSelect={(cat) => onUpdate(note.id, { category: cat })}
                    onAddNew={onAddCategory}
                    triggerLabel="+ Category"
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
            </div>

            {parsed.tags.length > 0 && !isEditing ? (
              <div
                className={`flex min-w-0 items-center gap-1 pt-2 transition-opacity duration-150 ease-out ${
                  showMetaRow ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
              >
                <TagRowIcon
                  className={
                    isArchived
                      ? 'w-3.5 h-3.5 shrink-0 text-neutral-400 dark:text-neutral-500'
                      : 'w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-stone-500'
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-center gap-1">
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

      {isEditing ? (
        <FloatingNoteSubmit
          compact
          visible={textareaFocused}
          topPx={floatingSubmitTopPx}
          onClick={commitText}
          disabled={false}
        />
      ) : null}
    </div>
  );
}
