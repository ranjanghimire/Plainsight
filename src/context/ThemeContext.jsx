import {
  createContext,
  useContext,
  useLayoutEffect,
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
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => readStoredTheme());

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
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

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
