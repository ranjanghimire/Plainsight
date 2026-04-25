import { useCallback, useEffect, useRef, useState } from 'react';
import { isCheckboxLine, stripCheckboxMarkFromLine } from '../utils/checkboxNoteLines.js';

const DEFAULT_BULLET_INDENT = '  ';

function lineBoundsAt(value, caret) {
  const safe = Math.max(0, Math.min(caret, value.length));
  const lineStart = value.lastIndexOf('\n', safe - 1) + 1;
  const nextNl = value.indexOf('\n', safe);
  const lineEnd = nextNl === -1 ? value.length : nextNl;
  return { lineStart, lineEnd, line: value.slice(lineStart, lineEnd) };
}

function replaceRange(value, start, end, insert) {
  return value.slice(0, start) + insert + value.slice(end);
}

/** Remove the empty bullet line; leave a plain continuation (caret at `lineStart`, often a new empty line). */
function mergeAfterRemovingLine(value, lineStart, lineEnd) {
  const before = value.slice(0, lineStart);
  let rest = value.slice(lineEnd);
  if (rest.startsWith('\n')) {
    rest = rest.slice(1);
  }
  if (!rest) {
    return { next: before, pos: lineStart };
  }
  return { next: before + rest, pos: lineStart };
}

/**
 * True if the line is a hyphen bullet line (same notion as editor bullet rows).
 * @param {string} lineNorm line without \r
 */
export function isHyphenBulletLine(lineNorm) {
  const t = String(lineNorm || '').replace(/\r/g, '');
  if (/^\s*-\s*$/.test(t)) return true;
  return /^(\s*)-\s/.test(t);
}

function stripBulletMarkFromLine(lineNorm) {
  return String(lineNorm || '').replace(/^(\s*)-\s*/, '');
}

/**
 * @param {object} opts
 * @param {boolean} [opts.searchMode] — Search bar: Enter does not submit; bullets still continue lists; bold-only uses native newline
 * @param {boolean} [opts.defaultPopoverExpanded] — Initial expand state for format popover (tag row)
 * @param {() => void} [opts.onSubmit]
 * @param {() => void} [opts.onCommit]
 */
export function useNoteFormatModes({
  searchMode = false,
  defaultPopoverExpanded = false,
  onSubmit,
  onCommit,
} = {}) {
  const [boldMode, setBoldMode] = useState(false);
  const [bulletsMode, setBulletsMode] = useState(false);
  const [checklistMode, setChecklistMode] = useState(false);
  const [popoverExpanded, setPopoverExpanded] = useState(defaultPopoverExpanded);

  /** Implied whenever First line bold or Bullets is on (multiline); drives Enter → new line + floating send. */
  const newlineMode = boldMode || bulletsMode || checklistMode;

  const bulletIndentRef = useRef(DEFAULT_BULLET_INDENT);
  /** Enter handling must not rely on stale React state (controlled textarea vs. last render). */
  const bulletsModeRef = useRef(bulletsMode);
  const checklistModeRef = useRef(checklistMode);
  const newlineModeRef = useRef(newlineMode);
  useEffect(() => {
    bulletsModeRef.current = bulletsMode;
  }, [bulletsMode]);
  useEffect(() => {
    checklistModeRef.current = checklistMode;
  }, [checklistMode]);
  useEffect(() => {
    newlineModeRef.current = newlineMode;
  }, [newlineMode]);

  const openPopover = useCallback(() => {
    setPopoverExpanded(true);
  }, []);

  const closePopover = useCallback(() => {
    setPopoverExpanded(false);
  }, []);

  const resetFormatModes = useCallback(() => {
    setBoldMode(false);
    setBulletsMode(false);
    setChecklistMode(false);
    setPopoverExpanded(defaultPopoverExpanded);
    bulletsModeRef.current = false;
    checklistModeRef.current = false;
    newlineModeRef.current = false;
    bulletIndentRef.current = DEFAULT_BULLET_INDENT;
  }, [defaultPopoverExpanded]);

  /** Sync list-format toggles from caret line (checkbox vs hyphen bullet vs plain). */
  const syncBulletsModeFromCaretAt = useCallback((valueStr, caretPos) => {
    const doc = String(valueStr ?? '');
    const safe = Math.max(0, Math.min(caretPos ?? 0, doc.length));
    const { line } = lineBoundsAt(doc, safe);
    const norm = line.replace(/\r/g, '');
    const cb = isCheckboxLine(norm);
    const hy = isHyphenBulletLine(norm);
    setChecklistMode(cb);
    checklistModeRef.current = cb;
    setBulletsMode(hy && !cb);
    bulletsModeRef.current = hy && !cb;
  }, []);

  const syncBulletsModeFromCaret = useCallback(
    (valueStr, textarea) => {
      if (!textarea || typeof textarea.selectionStart !== 'number') return;
      syncBulletsModeFromCaretAt(valueStr, textarea.selectionStart);
    },
    [syncBulletsModeFromCaretAt],
  );

  const applyBulletLineToggle = useCallback(
    (textarea, value, setValue) => {
      if (!textarea) return;
      const doc = String(value ?? '');
      const start = textarea.selectionStart ?? doc.length;
      const { lineStart, lineEnd, line } = lineBoundsAt(doc, start);
      const lineNorm = line.replace(/\r/g, '');

      if (isCheckboxLine(lineNorm)) {
        const stripped = stripCheckboxMarkFromLine(lineNorm);
        const next = doc.slice(0, lineStart) + stripped + doc.slice(lineEnd);
        setValue(next);
        const pos = lineStart + stripped.length;
        requestAnimationFrame(() => {
          try {
            textarea.focus();
            textarea.setSelectionRange(pos, pos);
            syncBulletsModeFromCaretAt(next, pos);
          } catch {
            /* ignore */
          }
        });
        return;
      }

      if (isHyphenBulletLine(lineNorm)) {
        const stripped = stripBulletMarkFromLine(lineNorm);
        const next = doc.slice(0, lineStart) + stripped + doc.slice(lineEnd);
        setValue(next);
        const pos = lineStart + stripped.length;
        requestAnimationFrame(() => {
          try {
            textarea.focus();
            textarea.setSelectionRange(pos, pos);
            syncBulletsModeFromCaretAt(next, pos);
          } catch {
            /* ignore */
          }
        });
        return;
      }

      const body = lineNorm.replace(/^\s+/, '');
      const newLine = `${DEFAULT_BULLET_INDENT}- ${body}`;
      const next = doc.slice(0, lineStart) + newLine + doc.slice(lineEnd);
      setValue(next);
      const pos = lineStart + newLine.length;
      requestAnimationFrame(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(pos, pos);
          syncBulletsModeFromCaretAt(next, pos);
        } catch {
          /* ignore */
        }
      });
    },
    [syncBulletsModeFromCaretAt],
  );

  const applyCheckboxLineToggle = useCallback(
    (textarea, value, setValue) => {
      if (!textarea) return;
      const doc = String(value ?? '');
      const start = textarea.selectionStart ?? doc.length;
      const { lineStart, lineEnd, line } = lineBoundsAt(doc, start);
      const lineNorm = line.replace(/\r/g, '');

      if (isCheckboxLine(lineNorm)) {
        const stripped = stripCheckboxMarkFromLine(lineNorm);
        const next = doc.slice(0, lineStart) + stripped + doc.slice(lineEnd);
        setValue(next);
        const pos = lineStart + stripped.length;
        requestAnimationFrame(() => {
          try {
            textarea.focus();
            textarea.setSelectionRange(pos, pos);
            syncBulletsModeFromCaretAt(next, pos);
          } catch {
            /* ignore */
          }
        });
        return;
      }

      if (isHyphenBulletLine(lineNorm)) {
        const hm = lineNorm.match(/^(\s*)-\s*(.*)$/);
        const indent = hm ? hm[1] || '' : DEFAULT_BULLET_INDENT;
        const rest = hm ? hm[2] ?? '' : stripBulletMarkFromLine(lineNorm);
        const newLine = `${indent}[ ] ${rest}`;
        const next = doc.slice(0, lineStart) + newLine + doc.slice(lineEnd);
        setValue(next);
        const pos = lineStart + newLine.length;
        requestAnimationFrame(() => {
          try {
            textarea.focus();
            textarea.setSelectionRange(pos, pos);
            syncBulletsModeFromCaretAt(next, pos);
          } catch {
            /* ignore */
          }
        });
        return;
      }

      const body = lineNorm.replace(/^\s+/, '');
      const newLine = `${DEFAULT_BULLET_INDENT}[ ] ${body}`;
      const next = doc.slice(0, lineStart) + newLine + doc.slice(lineEnd);
      setValue(next);
      const pos = lineStart + newLine.length;
      requestAnimationFrame(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(pos, pos);
          syncBulletsModeFromCaretAt(next, pos);
        } catch {
          /* ignore */
        }
      });
    },
    [syncBulletsModeFromCaretAt],
  );

  const handleTextareaKeyDown = useCallback(
    (e, textarea, value, setValue) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const ta =
          textarea instanceof HTMLTextAreaElement
            ? textarea
            : e.currentTarget instanceof HTMLTextAreaElement
              ? e.currentTarget
              : null;
        const doc = ta != null && typeof ta.value === 'string' ? ta.value : value;
        const caret = ta?.selectionStart ?? doc.length;
        const selEnd = ta?.selectionEnd ?? doc.length;

        const { lineStart, lineEnd, line } = lineBoundsAt(doc, caret);
        const lineNorm = line.replace(/\r/g, '');

        const runListEnter = (markerSuffix) => {
          e.preventDefault();
          const emptyRe =
            markerSuffix === '- '
              ? /^\s*-\s*$/
              : markerSuffix === '[ ] '
                ? /^\s*\[( |x|X)\]\s*$/
                : null;
          if (emptyRe && emptyRe.test(lineNorm)) {
            const { next, pos } = mergeAfterRemovingLine(doc, lineStart, lineEnd);
            setValue(next);
            requestAnimationFrame(() => {
              try {
                ta?.setSelectionRange(pos, pos);
                syncBulletsModeFromCaretAt(next, pos);
              } catch {
                /* ignore */
              }
            });
            return;
          }
          const indentMatch =
            markerSuffix === '- '
              ? line.match(/^(\s*)-\s*/)
              : line.match(/^(\s*)\[( |x|X)\]\s*/);
          let indent = indentMatch ? indentMatch[1] : bulletIndentRef.current;
          if (!indent || indent.length === 0) {
            indent = bulletIndentRef.current || DEFAULT_BULLET_INDENT;
          }
          bulletIndentRef.current = indent;
          const markerPrefixLen = indentMatch ? indentMatch[0].length : indent.length + markerSuffix.length;
          const singleCaret = caret === selEnd;
          const relInLine = caret - lineStart;

          if (singleCaret && caret < lineEnd && relInLine > markerPrefixLen) {
            const beforeInLine = doc.slice(lineStart, caret);
            const afterInLine = doc.slice(caret, lineEnd);
            const rolled = afterInLine.replace(/^\s+/, '');
            const secondLine = `${indent}${markerSuffix}${rolled}`;
            const next = doc.slice(0, lineStart) + beforeInLine + '\n' + secondLine + doc.slice(lineEnd);
            const secondLineMarkerLen = markerSuffix.length + indent.length;
            const pos = lineStart + beforeInLine.length + 1 + secondLineMarkerLen;
            setValue(next);
            requestAnimationFrame(() => {
              try {
                ta?.setSelectionRange(pos, pos);
                syncBulletsModeFromCaretAt(next, pos);
              } catch {
                /* ignore */
              }
            });
            return;
          }

          const insert = `\n${indent}${markerSuffix}`;
          const next = doc.slice(0, lineEnd) + insert + doc.slice(lineEnd);
          const pos = lineEnd + insert.length;
          setValue(next);
          requestAnimationFrame(() => {
            try {
              ta?.setSelectionRange(pos, pos);
              syncBulletsModeFromCaretAt(next, pos);
            } catch {
              /* ignore */
            }
          });
        };

        if (isCheckboxLine(lineNorm)) {
          runListEnter('[ ] ');
          return;
        }

        if (isHyphenBulletLine(lineNorm)) {
          runListEnter('- ');
          return;
        }

        // Search bar: submit only via send; plain Enter inserts a newline (no bold-only synthetic newline).
        if (searchMode) {
          return;
        }

        if (newlineModeRef.current) {
          e.preventDefault();
          const start = caret;
          const end = selEnd;
          const next = replaceRange(doc, start, end, '\n');
          setValue(next);
          const pos = start + 1;
          requestAnimationFrame(() => {
            try {
              ta?.setSelectionRange(pos, pos);
              syncBulletsModeFromCaretAt(next, pos);
            } catch {
              /* ignore */
            }
          });
          return;
        }
        if (onSubmit) {
          e.preventDefault();
          onSubmit();
        } else if (onCommit) {
          e.preventDefault();
          onCommit();
        }
        return;
      }
    },
    [onCommit, onSubmit, searchMode, syncBulletsModeFromCaretAt],
  );

  return {
    boldMode,
    setBoldMode,
    bulletsMode,
    setBulletsMode,
    checklistMode,
    setChecklistMode,
    newlineMode,
    popoverExpanded,
    setPopoverExpanded,
    openPopover,
    closePopover,
    handleTextareaKeyDown,
    applyBulletLineToggle,
    applyCheckboxLineToggle,
    syncBulletsModeFromCaret,
    syncBulletsModeFromCaretAt,
    resetFormatModes,
  };
}
