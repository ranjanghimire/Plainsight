import { createContext, useContext, useMemo, useState } from 'react';

const ArchiveModeContext = createContext(null);

export function ArchiveModeProvider({ children }) {
  const [archiveMode, setArchiveMode] = useState(false);
  const value = useMemo(
    () => ({ archiveMode, setArchiveMode }),
    [archiveMode],
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
