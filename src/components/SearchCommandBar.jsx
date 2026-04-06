import { useCallback, useRef, useLayoutEffect, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getWorkspaceKey, getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { loadWorkspace, saveWorkspace, getDefaultWorkspaceData } from '../utils/storage';

const TEXTAREA_MAX_PX = 160;
/** Lets the floating send button receive tap before blur hides it */
const BLUR_HIDE_DELAY_MS = 280;

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

function useKeyboardOverlapBottom() {
  const [gapPx, setGapPx] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const update = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      setGapPx(Math.max(0, overlap));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return gapPx;
}

export function SearchCommandBar({ value, onChange, onCreateNote }) {
  const navigate = useNavigate();
  const { switchWorkspace, currentWorkspace } = useWorkspace();
  const textareaRef = useRef(null);
  const blurHideTimeoutRef = useRef(null);
  const [inputFocused, setInputFocused] = useState(false);
  const keyboardOverlapBottom = useKeyboardOverlapBottom();

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      if (blurHideTimeoutRef.current != null) {
        window.clearTimeout(blurHideTimeoutRef.current);
      }
    };
  }, []);

  const clearBlurHideTimeout = useCallback(() => {
    if (blurHideTimeoutRef.current != null) {
      window.clearTimeout(blurHideTimeoutRef.current);
      blurHideTimeoutRef.current = null;
    }
  }, []);

  const handleTextareaFocus = useCallback(() => {
    clearBlurHideTimeout();
    setInputFocused(true);
  }, [clearBlurHideTimeout]);

  const handleTextareaBlur = useCallback(() => {
    clearBlurHideTimeout();
    blurHideTimeoutRef.current = window.setTimeout(() => {
      blurHideTimeoutRef.current = null;
      setInputFocused(false);
    }, BLUR_HIDE_DELAY_MS);
  }, [clearBlurHideTimeout]);

  const handleChange = useCallback(
    (e) => {
      let v = e.target.value;
      v = v.replace(/^\.\.\s+/, '..').replace(/^\.\s+/, '.');
      onChange?.(v);
    },
    [onChange],
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
        const key = getWorkspaceKey(name);
        let data = loadWorkspace(key);
        if (!data.notes?.length && !data.categories?.length) {
          data = getDefaultWorkspaceData();
          saveWorkspace(key, data);
        }
        switchWorkspace(name);
        navigate(name === 'home' ? '/' : `/w/${name}`);
        onChange?.('');
      }
    }
  }, [value, navigate, onChange, switchWorkspace, currentWorkspace]);

  const submitEntry = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const isSingleLine = !/\r?\n/.test(trimmed);
    if (isSingleLine && trimmed.startsWith('.')) {
      applyCommand();
      return;
    }
    onCreateNote?.(trimmed);
    onChange?.('');
  }, [value, applyCommand, onCreateNote, onChange]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitEntry();
      }
    },
    [submitEntry],
  );

  const handleFloatingPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      e.preventDefault();
    }
  }, []);

  const canSubmit = Boolean(value.trim());

  const floatingBottomStyle = {
    bottom: `calc(${keyboardOverlapBottom + 16}px + env(safe-area-inset-bottom, 0px))`,
    right: `calc(1rem + env(safe-area-inset-right, 0px))`,
  };

  const floatingButton =
    inputFocused && typeof document !== 'undefined'
      ? createPortal(
          <button
            type="button"
            onPointerDown={handleFloatingPointerDown}
            onClick={submitEntry}
            disabled={!canSubmit}
            style={floatingBottomStyle}
            className="fixed z-[100] flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white shadow-lg ring-1 ring-black/10 transition-opacity hover:bg-stone-700 disabled:pointer-events-none disabled:opacity-35 dark:bg-stone-200 dark:text-stone-900 dark:ring-white/20 dark:hover:bg-stone-100"
            aria-label="Add note"
          >
            <SendNoteIcon className="h-8 w-8" />
          </button>,
          document.body,
        )
      : null;

  return (
    <>
      {floatingButton}
      <div className="flex gap-2 items-center rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 focus-within:ring-2 focus-within:ring-stone-300 focus-within:border-stone-300 dark:focus-within:ring-stone-600">
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 min-h-[2.75rem] max-h-40 px-4 py-2.5 text-base rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none dark:text-stone-200 dark:placeholder-stone-500"
          placeholder="Type here.."
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleTextareaFocus}
          onBlur={handleTextareaBlur}
          aria-label="New note"
        />
        <button
          type="button"
          onClick={submitEntry}
          disabled={!canSubmit}
          className="shrink-0 mr-2 p-2 rounded-lg text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:pointer-events-none dark:text-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600"
          aria-label="Add note"
        >
          <SendNoteIcon />
        </button>
      </div>
    </>
  );
}
