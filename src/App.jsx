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
        <Route path="/manage" element={<ManagePage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
