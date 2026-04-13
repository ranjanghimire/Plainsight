import { useCallback, useRef, useLayoutEffect, useMemo, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { LiveTextScanner } from '../plugins/liveTextScanner.js';

const TEXTAREA_MAX_PX = 160;
const TAG_LEADING_ICON = '#';

/** Draft uses the left UI "#" for the first tag only; further tags use " #name" in the input. */
function tagDraftToHashtagLine(draft) {
  let t = String(draft || '').trim();
  if (!t) return '';
  t = t.replace(/^#+/, '');
  t = t.replace(/\s+#+/g, ' #');
  t = t.replace(/\s+#\s*$/, '');
  if (!t) return '';
  const segments = t
    .split(/\s+#\s*/)
    .map((s) => s.trim().replace(/^#+/, '').replace(/\s+/g, '_'))
    .filter(Boolean);
  if (segments.length === 0) return '';
  return segments.map((s) => `#${s}`).join(' ');
}

function parseTagsFromDraft(draft) {
  const line = tagDraftToHashtagLine(draft);
  if (!line) return [];
  const out = [];
  const seen = new Set();
  const re = /#([a-z0-9_]+)/gi;
  let m;
  while ((m = re.exec(line)) != null) {
    const t = String(m[1] || '').toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

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
  const [tagDraft, setTagDraft] = useState('');
  const [liveTextScanAvailable, setLiveTextScanAvailable] = useState(false);
  const [liveTextScanMessage, setLiveTextScanMessage] = useState('');

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
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [value]);

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
    onCreateNote?.(combined);
    onChange?.('');
    setTagDraft('');
  }, [searchOnly, value, applyCommand, onCreateNote, onChange, tags]);

  const handleKeyDown = useCallback(
    (e) => {
      if (searchOnly) return;
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      submitEntry();
    },
    [searchOnly, submitEntry],
  );

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
          rows={1}
          className={`flex-1 min-h-[2.75rem] max-h-40 px-4 py-2.5 text-base rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none dark:text-stone-200 dark:placeholder-stone-500 ${searchOnly ? 'mr-2' : ''}`}
          placeholder={searchOnly ? 'Search archive..' : 'Type here..'}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setLiveTextScanMessage('')}
          aria-label={searchOnly ? 'Search archive' : 'New note'}
        />
        {liveTextScanAvailable && !searchOnly && (
          <button type="button" onClick={handleLiveTextScan} className={iconButtonClass} aria-label="Scan text with camera">
            <CameraViewfinderIcon />
          </button>
        )}
        {!searchOnly && (
          <button
            type="button"
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

      {showTagRow && (
        <div className="border-t border-stone-200 dark:border-stone-600 px-4 py-2 flex items-center gap-0 text-stone-500 dark:text-stone-400">
          <span className="select-none text-sm shrink-0 leading-none pr-0" aria-hidden>
            {TAG_LEADING_ICON}
          </span>
          <input
            type="text"
            value={tagDraft}
            onChange={(e) => {
              let v = e.target.value;
              v = v.replace(/^#+/, '');
              v = v.replace(/\s+#+/g, ' #');
              setTagDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitEntry();
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
            placeholder="tag"
            className="flex-1 min-w-0 bg-transparent text-sm text-stone-700 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none pl-0"
            aria-label="Tags"
          />
        </div>
      )}
    </div>
  );
}
