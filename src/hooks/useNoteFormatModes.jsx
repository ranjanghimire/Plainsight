import { useCallback, useEffect, useRef, useState } from 'react';

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
 * @param {object} opts
 * @param {boolean} [opts.searchMode] — Enter submits via onSubmit when no format intercepts
 * @param {() => void} [opts.onSubmit]
 * @param {() => void} [opts.onCommit]
 */
export function useNoteFormatModes({ searchMode = false, onSubmit, onCommit } = {}) {
  const [boldMode, setBoldMode] = useState(false);
  const [bulletsMode, setBulletsMode] = useState(false);
  const [popoverExpanded, setPopoverExpanded] = useState(false);

  /** Implied whenever First line bold or Bullets is on (multiline); drives Enter → new line + floating send. */
  const newlineMode = boldMode || bulletsMode;

  const bulletIndentRef = useRef(DEFAULT_BULLET_INDENT);
  /** Enter handling must not rely on stale React state (controlled textarea vs. last render). */
  const bulletsModeRef = useRef(bulletsMode);
  const newlineModeRef = useRef(newlineMode);
  useEffect(() => {
    bulletsModeRef.current = bulletsMode;
  }, [bulletsMode]);
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
    setPopoverExpanded(false);
    bulletsModeRef.current = false;
    newlineModeRef.current = false;
    bulletIndentRef.current = DEFAULT_BULLET_INDENT;
  }, []);

  const applyBulletsTurnOn = useCallback((textarea, value, setValue) => {
    const indent = bulletIndentRef.current;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const ins =
      value.length === 0 && start === 0 ? `${indent}- ` : `\n${indent}- `;
    const next = replaceRange(value, start, end, ins);
    setValue(next);
    const pos = start + ins.length;
    requestAnimationFrame(() => {
      try {
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  }, []);

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

        // Bullets before newline: if both modes are on, Enter must continue the list, not insert a bare \n.
        if (bulletsModeRef.current) {
          e.preventDefault();
          const { lineStart, lineEnd, line } = lineBoundsAt(doc, caret);
          const lineNorm = line.replace(/\r/g, '');
          if (/^\s*-\s*$/.test(lineNorm)) {
            const { next, pos } = mergeAfterRemovingLine(doc, lineStart, lineEnd);
            bulletsModeRef.current = false;
            setBulletsMode(false);
            setValue(next);
            requestAnimationFrame(() => {
              try {
                ta?.setSelectionRange(pos, pos);
              } catch {
                /* ignore */
              }
            });
            return;
          }
          const indentMatch = line.match(/^(\s*)-\s*/);
          let indent = indentMatch ? indentMatch[1] : bulletIndentRef.current;
          if (!indent || indent.length === 0) {
            indent = bulletIndentRef.current || DEFAULT_BULLET_INDENT;
          }
          bulletIndentRef.current = indent;
          const insert = `\n${indent}- `;
          const next = doc.slice(0, lineEnd) + insert + doc.slice(lineEnd);
          setValue(next);
          const pos = lineEnd + insert.length;
          requestAnimationFrame(() => {
            try {
              ta?.setSelectionRange(pos, pos);
            } catch {
              /* ignore */
            }
          });
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
            } catch {
              /* ignore */
            }
          });
          return;
        }
        if (searchMode && onSubmit) {
          e.preventDefault();
          onSubmit();
        } else if (!searchMode && onCommit) {
          e.preventDefault();
          onCommit();
        }
        return;
      }
    },
    [onCommit, onSubmit, searchMode],
  );

  const toggleBullets = useCallback(
    (next, textarea, value, setValue) => {
      bulletsModeRef.current = next;
      setBulletsMode(next);
      if (next && textarea) {
        applyBulletsTurnOn(textarea, value, setValue);
      }
    },
    [applyBulletsTurnOn],
  );

  return {
    boldMode,
    setBoldMode,
    bulletsMode,
    setBulletsMode,
    newlineMode,
    popoverExpanded,
    setPopoverExpanded,
    openPopover,
    closePopover,
    handleTextareaKeyDown,
    toggleBullets,
    resetFormatModes,
  };
}
