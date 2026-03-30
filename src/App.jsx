import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ThemeProvider } from './context/ThemeContext';
import { ArchiveModeProvider, useArchiveMode } from './context/ArchiveModeContext';
import { MenuPanel, MenuButton } from './components/MenuPanel';
import { HomePage } from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { ManagePage } from './pages/ManagePage';

function RedirectWorkspaceOnLoad() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith('/w/')) {
      navigate('/', { replace: true });
    }
  }, []);

  return null;
}

function ArchiveHistoryButton() {
  const { archiveMode, setArchiveMode } = useArchiveMode();
  return (
    <button
      type="button"
      onClick={() => setArchiveMode((a) => !a)}
      aria-pressed={archiveMode}
      aria-label={archiveMode ? 'Exit archive' : 'Archive and history'}
      className={`p-2 rounded-lg transition-colors ${
        archiveMode
          ? 'text-stone-800 bg-stone-200 dark:text-stone-100 dark:bg-stone-600'
          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700'
      }`}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
        />
      </svg>
    </button>
  );
}

function AppHeader({ onOpenSettings }) {
  return (
    <header className="border-b border-stone-200 dark:border-stone-600 py-3 mb-4 flex items-center justify-between gap-4">
      <h1 className="font-header text-2xl font-semibold tracking-widest lowercase pl-1 text-stone-800 dark:text-stone-200">
        Plainsight
      </h1>
      <div className="flex items-center gap-0.5 shrink-0">
        <ArchiveHistoryButton />
        <MenuButton onOpen={onOpenSettings} />
      </div>
    </header>
  );
}

function AppRoutes() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <RedirectWorkspaceOnLoad />
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
      <MenuPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/w/:workspace" element={<WorkspacePage />} />
        <Route path="/ws/:workspace" element={<WorkspacePage />} />
        <Route path="/manage" element={<ManagePage />} />
      </Routes>
    </>
  );
}

function NavigationLock() {
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <ArchiveModeProvider>
            <NavigationLock />
            <AppRoutes />
          </ArchiveModeProvider>
        </BrowserRouter>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
