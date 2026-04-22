import { useCallback, useRef, useLayoutEffect, useMemo, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { LiveTextScanner } from '../plugins/liveTextScanner.js';
import { useNoteFormatModes } from '../hooks/useNoteFormatModes.jsx';
import { useFloatingSubmitTopPx } from '../hooks/useVisualViewportBottomInset.js';
import { NoteFormatPopover, FloatingNoteSubmit } from './noteFormat/NoteFormatPopover.jsx';
import { normalizeTagDraftInput, parseTagsFromDraft } from '../utils/noteTags';

/** Max auto-grow height; min height is set for ~4 visible lines. */
const TEXTAREA_MAX_PX = 280;
/** Avoid 0px inline height when scrollHeight is 0 (e.g. empty field before layout). */
const TEXTAREA_MIN_AUTO_PX = 104;
const TAG_LEADING_ICON = '#';

function SendNoteIcon({ className = 'w-5 h-5' }) {
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

/** Stroke icon aligned with `SendNoteIcon` (SF Symbol `camera.viewfinder`–style). */
function CameraViewfinderIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5v-9z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 10.25a2.75 2.75 0 105.5 0 2.75 2.75 0 00-5.5 0zM2 5.5L2 2.5M5.5 2L2.5 2M22 5.5L22 2.5M18.5 2L21.5 2M2 18.5L2 21.5M5.5 22L2.5 22M22 18.5L22 21.5M18.5 22L21.5 22"
      />
    </svg>
  );
}

export function SearchCommandBar({ value, onChange, onCreateNote, searchOnly = false }) {
  const navigate = useNavigate();
  const { switchWorkspace, currentWorkspace, canOpenOrCreateHiddenWorkspace } =
    useWorkspace();
  const textareaRef = useRef(null);
  const rootRef = useRef(null);
  /** True while focus is anywhere inside the bar (textarea, tags, or send). */
  const [barFocused, setBarFocused] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [liveTextScanAvailable, setLiveTextScanAvailable] = useState(false);
  const [liveTextScanMessage, setLiveTextScanMessage] = useState('');
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
    searchMode: true,
    defaultPopoverExpanded: true,
  });

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await LiveTextScanner.getHardwareSupport();
        if (!cancelled) setLiveTextScanAvailable(Boolean(r.hardware));
      } catch {
        if (!cancelled) setLiveTextScanAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchOnly) {
      setBarFocused(false);
      return undefined;
    }
    const el = rootRef.current;
    if (!el) return undefined;

    const onFocusIn = () => setBarFocused(true);
    const onFocusOut = (e) => {
      const next = e.relatedTarget;
      if (next instanceof Node && el.contains(next)) return;
      requestAnimationFrame(() => {
        const ae = document.activeElement;
        if (ae instanceof Node && el.contains(ae)) return;
        setBarFocused(false);
      });
    };

    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [searchOnly]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (searchOnly) {
      el.style.height = '';
      return;
    }
    if (!textareaFocused) {
      // Collapsed state: keep the composer one line tall until the user focuses it.
      el.style.height = '2.5rem';
      return;
    }
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_AUTO_PX), TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
  }, [value, searchOnly, textareaFocused]);

  useLayoutEffect(() => {
    if (searchOnly) return;
    const ta = textareaRef.current;
    if (!ta) return;
    syncBulletsModeFromCaret(value, ta);
  }, [value, searchOnly, syncBulletsModeFromCaret]);

  const setValueFromFormat = useCallback(
    (next) => {
      let v = String(next ?? '');
      if (!searchOnly) {
        v = v.replace(/^\.\.\s+/, '..').replace(/^\.\s+/, '.');
      }
      onChange?.(v);
    },
    [onChange, searchOnly],
  );

  const handleChange = useCallback(
    (e) => {
      let v = e.target.value;
      if (!searchOnly) {
        v = v.replace(/^\.\.\s+/, '..').replace(/^\.\s+/, '.');
      }
      onChange?.(v);
    },
    [onChange, searchOnly],
  );

  const applyCommand = useCallback(() => {
    const cmd = value.trim();
    if (!cmd) return;
    if (cmd === '.') {
      if (currentWorkspace !== 'home') {
        switchWorkspace('home');
        navigate('/');
      }
      onChange?.('');
      return;
    }
    if (cmd.startsWith('..')) {
      if (cmd === '..reset') {
        clearMasterKey();
        onChange?.('');
        return;
      }
      const stored = getMasterKey();
      if (!stored) {
        setMasterKey(cmd);
        navigate('/manage');
        onChange?.('');
      } else if (cmd === stored) {
        navigate('/manage');
        onChange?.('');
      }
      return;
    }
    if (cmd.startsWith('.') && cmd.length > 1) {
      const rest = cmd.slice(1).trim();
      if (rest) {
        const name = rest.toLowerCase().replace(/\s+/g, '_');
        if (!canOpenOrCreateHiddenWorkspace(name)) {
          onChange?.('');
          return;
        }
        switchWorkspace(name);
        navigate(name === 'home' ? '/' : `/w/${name}`);
        onChange?.('');
      }
    }
  }, [value, navigate, onChange, switchWorkspace, currentWorkspace, canOpenOrCreateHiddenWorkspace]);

  const isCommandText = useMemo(() => {
    if (searchOnly) return false;
    const t = String(value || '').trim();
    return t.startsWith('.') || t.startsWith('..');
  }, [searchOnly, value]);

  const showTagRow = !searchOnly && barFocused && !isCommandText;
  const tags = useMemo(() => parseTagsFromDraft(tagDraft), [tagDraft]);

  const submitEntry = useCallback(() => {
    if (searchOnly) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const isSingleLine = !/\r?\n/.test(trimmed);
    if (isSingleLine && trimmed.startsWith('.')) {
      applyCommand();
      return;
    }
    const tagLine = tags.length ? tags.map((t) => `#${t}`).join(' ') : '';
    const combined = tagLine ? `${tagLine}\n${trimmed}` : trimmed;
    onCreateNote?.(combined, { boldFirstLine: boldMode });
    onChange?.('');
    setTagDraft('');
    resetFormatModes();
  }, [searchOnly, value, applyCommand, onCreateNote, onChange, tags, boldMode, resetFormatModes]);

  const canSubmit = !searchOnly && Boolean(value.trim());

  const handleLiveTextScan = useCallback(async () => {
    setLiveTextScanMessage('');
    try {
      const r = await LiveTextScanner.scanText();
      if (r.error === 'denied') {
        setLiveTextScanMessage(
          'Camera is off for Plainsight. Turn it on in Settings → Privacy → Camera to scan text.',
        );
        return;
      }
      if (r.error === 'unsupported' || r.error === 'busy') return;
      const piece = r.text != null ? String(r.text).trim() : '';
      if (piece) {
        const base = String(value || '').trimEnd();
        onChange?.(base ? `${base} ${piece}` : piece);
      }
    } catch {
      setLiveTextScanMessage('Could not open the text scanner.');
    }
  }, [value, onChange]);

  const iconButtonClass =
    'shrink-0 p-2 rounded-lg text-stone-600 bg-stone-100 hover:bg-stone-200 dark:text-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600';

  return (
    <div
      ref={rootRef}
      className="rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 focus-within:ring-2 focus-within:ring-stone-300 focus-within:border-stone-300 dark:focus-within:ring-stone-600"
    >
      <div className="flex gap-2 items-center">
        <textarea
          ref={textareaRef}
          rows={searchOnly ? 1 : textareaFocused ? 4 : 1}
          className={
            searchOnly
              ? 'flex-1 h-10 min-h-10 max-h-10 shrink-0 px-3 py-0 mr-2 text-base leading-10 rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none overflow-y-auto dark:text-stone-200 dark:placeholder-stone-500'
              : textareaFocused
                ? 'flex-1 min-h-[6.5rem] max-h-80 px-4 py-2.5 text-base leading-relaxed rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none dark:text-stone-200 dark:placeholder-stone-500'
                : 'flex-1 h-10 min-h-10 max-h-10 shrink-0 px-4 py-0 mr-2 text-base leading-10 rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none overflow-y-auto dark:text-stone-200 dark:placeholder-stone-500'
          }
          placeholder={searchOnly ? 'Search archive..' : 'Type here..'}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (searchOnly) return;
            handleTextareaKeyDown(e, textareaRef.current, value, setValueFromFormat);
          }}
          onKeyUp={(e) => {
            if (searchOnly) return;
            const ta = e.currentTarget;
            syncBulletsModeFromCaret(ta.value, ta);
          }}
          onSelect={(e) => {
            if (searchOnly) return;
            const ta = e.currentTarget;
            syncBulletsModeFromCaret(ta.value, ta);
          }}
          onFocus={() => {
            setLiveTextScanMessage('');
            setTextareaFocused(true);
            if (!searchOnly) openPopover();
          }}
          onBlur={() => {
            requestAnimationFrame(() => setTextareaFocused(false));
          }}
          aria-label={searchOnly ? 'Search archive' : 'New note'}
        />
        {liveTextScanAvailable && !searchOnly && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLiveTextScan}
            className={iconButtonClass}
            aria-label="Scan text with camera"
          >
            <CameraViewfinderIcon />
          </button>
        )}
        {!searchOnly && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submitEntry}
            disabled={!canSubmit}
            className={`${iconButtonClass} mr-2 disabled:opacity-40 disabled:pointer-events-none`}
            aria-label="Add note"
          >
            <SendNoteIcon />
          </button>
        )}
      </div>

      {liveTextScanMessage ? (
        <p className="px-4 pb-2 text-xs text-amber-800 dark:text-amber-200/90" role="status">
          {liveTextScanMessage}
        </p>
      ) : null}

      {!searchOnly && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:duration-0 ${
            showTagRow ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-stone-200 dark:border-stone-600 px-4 py-2 flex min-w-0 items-stretch gap-1.5 text-stone-500 dark:text-stone-400">
              <div className="flex min-h-0 min-w-0 flex-1 items-center gap-0 overflow-hidden">
                <span className="select-none text-sm shrink-0 leading-none pr-0" aria-hidden>
                  {TAG_LEADING_ICON}
                </span>
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(normalizeTagDraftInput(e.target.value))}
                  onFocus={() => closePopover()}
                  onKeyDown={(e) => {
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
                  placeholder="tag"
                  className="flex-1 min-w-0 bg-transparent text-sm text-stone-700 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none pl-0"
                  aria-label="Tags"
                  tabIndex={showTagRow ? 0 : -1}
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
            value={value}
            setValue={setValueFromFormat}
            applyBulletLineToggle={applyBulletLineToggle}
            applyCheckboxLineToggle={applyCheckboxLineToggle}
          />
            </div>
          </div>
        </div>
      )}

      {!searchOnly && (
        <FloatingNoteSubmit
          visible={textareaFocused}
          topPx={floatingSubmitTopPx}
          onClick={submitEntry}
          disabled={!canSubmit}
        />
      )}
    </div>
  );
}
