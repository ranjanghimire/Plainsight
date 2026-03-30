import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

function MenuIcon({ className = '' }) {
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
        d="M5 8h14M5 12h14M5 16h14"
      />
    </svg>
  );
}

export function MenuButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="p-2 -mr-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700 transition-colors"
      aria-label="Open menu"
    >
      <MenuIcon className="w-6 h-6" />
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
      const id = requestAnimationFrame(() => {
        setMounted(true);
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    const t0 = window.setTimeout(() => setEntered(false), 0);
    const t1 = window.setTimeout(() => setMounted(false), DRAWER_MS);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
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
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={`
          relative h-full w-full max-w-sm border-l border-stone-200 dark:border-stone-600
          bg-white dark:bg-stone-800 shadow-2xl transition-transform duration-300 ease-out
          flex flex-col
          ${entered ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-labelledby="app-menu-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-600 shrink-0">
          <h2
            id="app-menu-title"
            className="text-lg font-medium text-stone-900 dark:text-stone-100"
          >
            Menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-2">
          <div className="border-b border-stone-100 dark:border-stone-700">
            <DrawerSwitch
              id="menu-dark-mode"
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
