import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceProvider } from './context/WorkspaceContext';
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

function AppRoutes() {
  return (
    <>
      <RedirectWorkspaceOnLoad />
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
    <WorkspaceProvider>
      <BrowserRouter>
        <NavigationLock />
        <AppRoutes />
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
