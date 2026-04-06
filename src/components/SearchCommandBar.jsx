import { useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getWorkspaceKey, getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { loadWorkspace, saveWorkspace, getDefaultWorkspaceData } from '../utils/storage';

const TEXTAREA_MAX_PX = 160;

function SendNoteIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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

export function SearchCommandBar({ value, onChange, onCreateNote }) {
  const navigate = useNavigate();
  const { switchWorkspace, currentWorkspace } = useWorkspace();
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [value]);

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

  const canSubmit = Boolean(value.trim());

  return (
    <div className="flex gap-2 items-center rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800 focus-within:ring-2 focus-within:ring-stone-300 focus-within:border-stone-300 dark:focus-within:ring-stone-600">
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 min-h-[2.75rem] max-h-40 px-4 py-2.5 text-base rounded-lg border-0 bg-transparent text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-0 resize-none dark:text-stone-200 dark:placeholder-stone-500"
        placeholder="Type here.."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
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
  );
}
