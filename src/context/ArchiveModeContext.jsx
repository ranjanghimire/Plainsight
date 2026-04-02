import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Out phase length before swapping workspace ↔ archive content */
const ARCHIVE_SWAP_MS = 165;

const ArchiveModeContext = createContext(null);

export function ArchiveModeProvider({ children }) {
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveViewTransitioning, setArchiveViewTransitioning] =
    useState(false);
  const transitionLockRef = useRef(false);
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const toggleArchiveMode = useCallback(() => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setArchiveViewTransitioning(true);
    timersRef.current.forEach(clearTimeout);
    const t = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((id) => id !== t);
      setArchiveMode((a) => !a);
      requestAnimationFrame(() => {
        setArchiveViewTransitioning(false);
        transitionLockRef.current = false;
      });
    }, ARCHIVE_SWAP_MS);
    timersRef.current.push(t);
  }, []);

  const value = useMemo(
    () => ({
      archiveMode,
      /** Immediate update only (e.g. tests); prefer {@link toggleArchiveMode} for UI */
      setArchiveMode,
      archiveViewTransitioning,
      toggleArchiveMode,
    }),
    [archiveMode, archiveViewTransitioning, toggleArchiveMode],
  );
  return (
    <ArchiveModeContext.Provider value={value}>
      {children}
    </ArchiveModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useArchiveMode is the public API
export function useArchiveMode() {
  const ctx = useContext(ArchiveModeContext);
  if (!ctx) {
    throw new Error('useArchiveMode must be used within ArchiveModeProvider');
  }
  return ctx;
}
