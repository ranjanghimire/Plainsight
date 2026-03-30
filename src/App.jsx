import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsDrawer, SettingsGearButton } from './components/SettingsDrawer';
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

function AppHeader({ onOpenSettings }) {
  return (
    <header className="border-b border-stone-200 dark:border-stone-600 py-3 mb-4 flex items-center justify-between gap-4">
      <h1 className="font-header text-2xl font-semibold tracking-widest lowercase pl-1 text-stone-800 dark:text-stone-200">
        Plainsight
      </h1>
      <SettingsGearButton onOpen={onOpenSettings} />
    </header>
  );
}

function AppRoutes() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <RedirectWorkspaceOnLoad />
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDrawer
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
          <NavigationLock />
          <AppRoutes />
        </BrowserRouter>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
