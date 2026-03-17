import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getWorkspaceKey, getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { loadWorkspace, saveWorkspace, getDefaultWorkspaceData } from '../utils/storage';

export function SearchCommandBar({ value, onChange, onCreateNote }) {
  const navigate = useNavigate();
  const { switchWorkspace, currentWorkspace } = useWorkspace();

  const handleChange = useCallback(
    (e) => {
      let v = e.target.value;
      v = v.replace(/^\.\.\s+/, '..').replace(/^\.\s+/, '.');
      onChange?.(v);
    },
    [onChange]
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

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return;
      const cmd = value.trim();
      if (cmd.startsWith('.')) {
        e.preventDefault();
        applyCommand();
        return;
      }
      if (cmd) {
        e.preventDefault();
        onCreateNote?.(cmd);
        onChange?.('');
      }
    },
    [value, applyCommand, onCreateNote, onChange]
  );

  return (
    <input
      type="text"
      className="w-full px-4 py-2.5 rounded-lg border border-stone-200 bg-white text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:border-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:placeholder-stone-500 dark:focus:ring-stone-600"
      placeholder="New note..."
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      aria-label="New note"
    />
  );
}
