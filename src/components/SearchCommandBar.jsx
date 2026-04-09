import { useCallback, useRef, useLayoutEffect, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';

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

export function SearchCommandBar({ value, onChange, onCreateNote, searchOnly = false }) {
  const navigate = useNavigate();
  const { switchWorkspace, currentWorkspace, canOpenOrCreateHiddenWorkspace } =
    useWorkspace();
  const textareaRef = useRef(null);
  const rootRef = useRef(null);
  /** True while focus is anywhere inside the bar (textarea, tags, or send). */
  const [barFocused, setBarFocused] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

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
          aria-label={searchOnly ? 'Search archive' : 'New note'}
        />
        {!searchOnly && (
          <button
            type="button"
            onClick={submitEntry}
            disabled={!canSubmit}
            className="shrink-0 mr-2 p-2 rounded-lg text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:pointer-events-none dark:text-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600"
            aria-label="Add note"
          >
            <SendNoteIcon />
          </button>
        )}
      </div>

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
