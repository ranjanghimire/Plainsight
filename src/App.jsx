import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useDrawerGestures } from './hooks/useDrawerGestures';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { SyncEntitlementProvider } from './context/SyncEntitlementContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ArchiveModeProvider, useArchiveMode } from './context/ArchiveModeContext';
import { TagsNavProvider, useTagsNav } from './context/TagsNavContext';

/** Same motion as archive toggle in {@link NotesView} (origin-top, scale, opacity, brightness). */
function TagsRouteTransitionShell({ children }) {
  const { tagsViewTransitioning } = useTagsNav();
  return (
    <div
      className={`origin-top transition-all duration-200 ease-out ${
        tagsViewTransitioning
          ? 'opacity-0 scale-[0.98] brightness-95'
          : 'opacity-100 scale-100 brightness-100'
      }`}
    >
      {children}
    </div>
  );
}
import { MenuPanel, MenuButton } from './components/MenuPanel';
import { HomePage } from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { ManagePage } from './pages/ManagePage';
import { TagsPage } from './pages/TagsPage';

function RedirectWorkspaceOnLoad() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFirstNavigationEffect = useRef(true);

  useEffect(() => {
    if (!isFirstNavigationEffect.current) return;
    isFirstNavigationEffect.current = false;
    const path = location.pathname;
    if (path.startsWith('/w/') || path.startsWith('/ws/')) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

function ArchiveHistoryButton() {
  const { archiveMode, toggleArchiveMode } = useArchiveMode();
  return (
    <button
      type="button"
      onClick={toggleArchiveMode}
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

function WorkspaceContentShell({ children }) {
  const {
    workspaceTransitionMode,
    workspaceContentTransitioning,
    workspaceTransitionEaseClass,
  } = useWorkspace();
  const isOut = workspaceContentTransitioning;
  const transitionClass =
    isOut && workspaceTransitionMode === 'hidden'
      ? 'opacity-80'
      : isOut && workspaceTransitionMode === 'visible'
        ? 'opacity-0 translate-y-[2px]'
        : 'opacity-100 translate-y-0';

  return (
    <div
      className={`transition-all ease-out ${workspaceTransitionEaseClass} ${transitionClass}`}
    >
      {children}
    </div>
  );
}

function TagsToggleButton() {
  const { isTagsRoute, toggleTagsPage } = useTagsNav();
  return (
    <button
      type="button"
      onClick={toggleTagsPage}
      aria-pressed={isTagsRoute}
      aria-label={isTagsRoute ? 'Exit tags' : 'Tags'}
      className={`p-2 rounded-lg transition-colors ${
        isTagsRoute
          ? 'text-stone-800 bg-stone-200 dark:text-stone-100 dark:bg-stone-600'
          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700'
      }`}
    >
      <svg
        className="w-6 h-6 block translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M7 7h.01M3 11l8.5 8.5a2 2 0 002.828 0L21 12.828a2 2 0 000-2.828L13.5 2.5A2 2 0 0012.086 2H5a2 2 0 00-2 2v7.086A2 2 0 003 11z"
        />
      </svg>
    </button>
  );
}

function AppHeader({ onOpenSettings }) {
  const { currentWorkspace, visibleWorkspaces } = useWorkspace();
  const { archiveMode } = useArchiveMode();
  const { isTagsRoute } = useTagsNav();

  const headerTitle = useMemo(() => {
    if (isTagsRoute) return 'Tags';
    if (archiveMode) return 'Archive';
    if (currentWorkspace === 'home') return 'Plainsight';
    if (typeof currentWorkspace === 'string' && currentWorkspace.startsWith('visible:')) {
      const id = currentWorkspace.slice('visible:'.length);
      const entry = (visibleWorkspaces || []).find((w) => w.id === id);
      return entry?.name || 'Workspace';
    }
    const slug = typeof currentWorkspace === 'string' ? currentWorkspace : '';
    const spaced = slug.replace(/_/g, ' ').trim();
    if (!spaced) return 'Workspace';
    return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  }, [archiveMode, currentWorkspace, visibleWorkspaces, isTagsRoute]);

  return (
    <header className="border-b border-stone-200 dark:border-stone-600 py-3 mb-4 flex items-center justify-between gap-4">
      <h1 className="font-header text-2xl font-semibold tracking-widest lowercase pl-1 text-stone-800 dark:text-stone-200">
        {headerTitle}
      </h1>
      <div className="flex items-center gap-0.5 shrink-0">
        <TagsToggleButton />
        <ArchiveHistoryButton />
        <MenuButton onOpen={onOpenSettings} />
      </div>
    </header>
  );
}

function AppRoutes() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openDrawer = useCallback(() => setSettingsOpen(true), []);
  const closeDrawer = useCallback(() => setSettingsOpen(false), []);

  useDrawerGestures({
    isOpen: settingsOpen,
    onOpen: openDrawer,
    onClose: closeDrawer,
  });

  return (
    <>
      <BackNavigationLock drawerOpen={settingsOpen} closeDrawer={closeDrawer} />
      <RedirectWorkspaceOnLoad />
      <AppHeader onOpenSettings={openDrawer} />
      <MenuPanel open={settingsOpen} onClose={closeDrawer} />
      <WorkspaceContentShell>
        <TagsRouteTransitionShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/w/:workspace" element={<WorkspacePage />} />
            <Route path="/ws/:workspace" element={<WorkspacePage />} />
            <Route path="/manage" element={<ManagePage />} />
            <Route path="/tags" element={<TagsPage />} />
          </Routes>
        </TagsRouteTransitionShell>
      </WorkspaceContentShell>
    </>
  );
}

const LEFT_EDGE_BACK_SWIPE_PX = 28;

/**
 * Forces in-app "back" (hardware back, swipe, popstate) to Home + `/`.
 * When the menu drawer is closed, left-edge touch moves that look like the iOS back-swipe
 * get preventDefault to reduce Safari starting that navigation (not 100% guaranteed by the OS).
 */
function BackNavigationLock({ drawerOpen, closeDrawer }) {
  const navigate = useNavigate();
  const { load } = useWorkspace();
  const loadRef = useRef(load);
  const closeDrawerRef = useRef(closeDrawer);
  const drawerOpenRef = useRef(drawerOpen);
  loadRef.current = load;
  closeDrawerRef.current = closeDrawer;
  drawerOpenRef.current = drawerOpen;

  useEffect(() => {
    const onPopState = () => {
      closeDrawerRef.current();
      loadRef.current('home');
      navigate('/', { replace: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);

  useEffect(() => {
    let fromLeftEdge = false;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      if (drawerOpenRef.current) {
        fromLeftEdge = false;
        return;
      }
      const t = e.touches[0];
      fromLeftEdge = t.clientX <= LEFT_EDGE_BACK_SWIPE_PX;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e) => {
      if (!fromLeftEdge || drawerOpenRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx > 12 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
      }
    };

    const end = () => {
      fromLeftEdge = false;
    };

    const root = document.documentElement;
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', end, { passive: true });
    root.addEventListener('touchcancel', end, { passive: true });

    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', end);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncEntitlementProvider>
          <WorkspaceProvider>
            <BrowserRouter>
              <ArchiveModeProvider>
                <TagsNavProvider>
                  <AppRoutes />
                </TagsNavProvider>
              </ArchiveModeProvider>
            </BrowserRouter>
          </WorkspaceProvider>
        </SyncEntitlementProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
