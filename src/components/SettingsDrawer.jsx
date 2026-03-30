import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

function GearIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

export function SettingsGearButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="p-2 -mr-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700 transition-colors"
      aria-label="Open settings"
    >
      <GearIcon className="w-6 h-6" />
    </button>
  );
}

function DrawerSwitch({ checked, onChange, id, label }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-1">
      <span
        id={`${id}-label`}
        className="text-sm font-medium text-stone-800 dark:text-stone-200"
      >
        {label}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        className={`
          relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400
          ${checked ? 'bg-stone-700 dark:bg-stone-300' : 'bg-stone-200 dark:bg-stone-600'}
        `}
      >
        <span
          className={`
            absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200
            ${checked ? 'translate-x-5 dark:bg-stone-900' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

const DRAWER_MS = 300;

export function SettingsDrawer({ open, onClose }) {
  const { isDark, setIsDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), DRAWER_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className={`absolute inset-0 bg-stone-900/40 transition-opacity duration-300 ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Close settings"
        onClick={onClose}
      />
      <aside
        className={`
          relative h-full w-full max-w-sm border-l border-stone-200 dark:border-stone-600
          bg-white dark:bg-stone-800 shadow-2xl transition-transform duration-300 ease-out
          flex flex-col
          ${entered ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-label="Settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-600 shrink-0">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700"
            aria-label="Close settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2">
          <div className="border-b border-stone-100 dark:border-stone-700">
            <DrawerSwitch
              id="settings-dark-mode"
              label="Dark mode"
              checked={isDark}
              onChange={setIsDark}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
