import {
  createContext,
  useContext,
  useInsertionEffect,
  useMemo,
  useState,
} from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'plainsight-theme';

function readStoredTheme() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === 'dark') return true;
    if (s === 'light') return false;
  } catch {
    /* ignore */
  }
  // Default to light when no explicit preference is stored.
  return false;
}

/** Keep `<html>`, `theme-color`, and `color-scheme` aligned (see blocking script in `index.html`). */
function applyThemeToDocument(isDark) {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
  try {
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#0c0a09' : '#fafaf9');
  }
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => readStoredTheme());

  useInsertionEffect(() => {
    applyThemeToDocument(isDark);
  }, [isDark]);

  const value = useMemo(
    () => ({
      isDark,
      setIsDark,
      toggleDark: () => setIsDark((d) => !d),
    }),
    [isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useTheme is the public API
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
