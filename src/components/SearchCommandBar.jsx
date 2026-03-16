import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { getWorkspaceKey, getMasterKey, setMasterKey, clearMasterKey } from '../utils/storage';
import { loadWorkspace, saveWorkspace, getDefaultWorkspaceData } from '../utils/storage';

export function SearchCommandBar({ searchQuery, onSearchChange, placeholder = 'Search notes…' }) {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const [value, setValue] = useState(searchQuery);

  useEffect(() => {
    setValue(searchQuery);
  }, [searchQuery]);

  const handleChange = useCallback((e) => {
    const v = e.target.value;
    setValue(v);
    onSearchChange?.(v);
  }, [onSearchChange]);

  const applyCommand = useCallback(() => {
    const cmd = value.trim();
    if (!cmd) return;
    if (cmd.startsWith('..')) {
      if (cmd === '..reset') {
        clearMasterKey();
        setValue('');
        onSearchChange?.('');
        return;
      }
      const stored = getMasterKey();
      if (!stored) {
        setMasterKey(cmd);
        navigate('/manage');
        setValue('');
        onSearchChange?.('');
      } else if (cmd === stored) {
        navigate('/manage');
        setValue('');
        onSearchChange?.('');
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
        setValue('');
        onSearchChange?.('');
      }
    }
  }, [value, navigate, onSearchChange, switchWorkspace]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter') return;
      const cmd = value.trim();
      if (cmd.startsWith('.')) {
        e.preventDefault();
        applyCommand();
      }
    },
    [value, applyCommand]
  );

  return (
    <input
      type="text"
      className="w-full px-4 py-2.5 rounded-lg border border-stone-200 bg-white text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 focus:border-stone-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:placeholder-stone-500 dark:focus:ring-stone-600"
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      aria-label="Search notes"
    />
  );
}
