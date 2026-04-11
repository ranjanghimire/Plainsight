import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useSyncEntitlement } from '../context/SyncEntitlementContext';
import { useAuth } from '../context/AuthContext';
import {
  getSyncEntitled,
  getSyncRemoteActive,
  getOptimisticLastKnownSyncEntitledForMenu,
  hasCustomAuthSession,
  setSyncRemoteActive as persistSyncRemoteActive,
  subscribeSyncGating,
} from '../sync/syncEnabled';
import {
  useItemContextMenu,
  CONTEXT_MENU_TRIGGER_CLASS,
} from '../hooks/useItemContextMenu';
import { ContextActionPopover } from './ContextActionPopover';
import { ConfirmDialog } from './ConfirmDialog';

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

export function MenuPanel({ open, onClose }) {
  const navigate = useNavigate();
  const { isDark, setIsDark } = useTheme();
  const {
    activeStorageKey,
    visibleWorkspaces,
    switchVisibleWorkspace,
    createVisibleWorkspace,
    renameVisibleWorkspace,
    deleteVisibleWorkspace,
  } = useWorkspace();
  const {
    beginUpgradeFlow,
    showToast,
    revenueCatReady,
    isSubscriptionStatusPending,
  } = useSyncEntitlement();
  const { openSendCodeModal, signOut, authEmail, authReady } = useAuth();
  const [syncEntitled, setSyncEntitled] = useState(() => getSyncEntitled());
  const [syncRemoteActive, setSyncRemoteActive] = useState(() => getSyncRemoteActive());
  const [customAuthSession, setCustomAuthSession] = useState(() => hasCustomAuthSession());

  useEffect(
    () =>
      subscribeSyncGating(() => {
        setSyncEntitled(getSyncEntitled());
        setSyncRemoteActive(getSyncRemoteActive());
        setCustomAuthSession(hasCustomAuthSession());
      }),
    [],
  );

  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [workspaceRenameTarget, setWorkspaceRenameTarget] = useState(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState('');
  const [pendingDeleteWorkspace, setPendingDeleteWorkspace] = useState(null);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const wsMenu = useItemContextMenu();

  const menuSyncRestoreHint = getOptimisticLastKnownSyncEntitledForMenu();
  const showAuthCheckingLine = !authReady && menuSyncRestoreHint === null;
  /** Signed-out shell only; if tokens exist we fall through to subscription / sync rows. */
  const optimisticFreeMenuWhileRestoring =
    !authReady && menuSyncRestoreHint === false && !customAuthSession;

  useEffect(() => {
    if (!open) wsMenu.closeMenu();
  }, [open, wsMenu.closeMenu]);

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
    if (!mounted) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (wsMenu.menu.open) wsMenu.closeMenu();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, onClose, wsMenu.menu.open, wsMenu.closeMenu]);

  const handlePickWorkspace = (entry) => {
    switchVisibleWorkspace(entry);
    navigate('/');
    onClose();
  };

  const submitNewWorkspace = () => {
    const name = newWorkspaceName.trim();
    if (!name) return;
    createVisibleWorkspace(name);
    setNewWorkspaceName('');
    setNewWorkspaceOpen(false);
    navigate('/');
    onClose();
  };

  const submitWorkspaceRename = () => {
    if (!workspaceRenameTarget) return;
    const name = workspaceRenameDraft.trim();
    if (!name) return;
    renameVisibleWorkspace(workspaceRenameTarget, name);
    setWorkspaceRenameTarget(null);
    setWorkspaceRenameDraft('');
  };

  const cancelWorkspaceRename = () => {
    setWorkspaceRenameTarget(null);
    setWorkspaceRenameDraft('');
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        data-testid="menu-panel-backdrop"
        className={`absolute inset-0 bg-stone-900/40 transition-opacity duration-300 ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        data-testid="menu-panel"
        className={`
          relative h-full w-full max-w-xs border-l border-stone-200 dark:border-stone-600
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
          <div className="border-b border-stone-100 dark:border-stone-700 pb-1">
            <DrawerSwitch
              id="menu-dark-mode"
              label="Dark mode"
              checked={isDark}
              onChange={setIsDark}
            />
          </div>

          <div className="border-b border-stone-100 dark:border-stone-700 py-3 px-1 space-y-2">
            {showAuthCheckingLine ? (
              <p className="text-sm text-stone-500 dark:text-stone-400 px-1 py-1">
                Checking sign-in…
              </p>
            ) : optimisticFreeMenuWhileRestoring ? (
              <button
                type="button"
                onClick={openSendCodeModal}
                className="w-full px-3 py-2.5 text-sm font-medium text-center rounded-lg bg-stone-800 text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
              >
                Sign in to sync
              </button>
            ) : !customAuthSession ? (
              <button
                type="button"
                onClick={openSendCodeModal}
                className="w-full px-3 py-2.5 text-sm font-medium text-center rounded-lg bg-stone-800 text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
              >
                Sign in to sync
              </button>
            ) : !syncEntitled ? (
              !revenueCatReady || isSubscriptionStatusPending ? (
                <p className="text-sm text-stone-500 dark:text-stone-400 px-1 py-1">
                  Confirming your subscription…
                </p>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={beginUpgradeFlow}
                    className="w-full text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Unlock cloud sync
                  </button>
                  {authEmail ? (
                    <p
                      className="text-xs text-stone-500 dark:text-stone-400 pl-1"
                      style={{ opacity: 0.6 }}
                    >
                      Signed in as {authEmail}
                    </p>
                  ) : null}
                </div>
              )
            ) : !syncRemoteActive ? (
              <button
                type="button"
                onClick={() => persistSyncRemoteActive(true)}
                className="w-full text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Turn on cloud sync
              </button>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: '#4CAF50' }}
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    Cloud sync on
                  </p>
                </div>
                {authEmail ? (
                  <p
                    className="text-xs text-stone-500 dark:text-stone-400 pl-1"
                    style={{ opacity: 0.6 }}
                  >
                    Signed in as {authEmail}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-2">
              Workspaces
            </h3>
            <div className="border-t border-stone-200 dark:border-stone-600 pt-2 space-y-0.5">
              {visibleWorkspaces.map((entry) => {
                const active = entry.key === activeStorageKey;
                const isRenaming = workspaceRenameTarget?.key === entry.key;
                if (isRenaming) {
                  return (
                    <div key={entry.key} className="flex flex-col gap-2 px-1 py-1">
                      <input
                        type="text"
                        value={workspaceRenameDraft}
                        onChange={(e) => setWorkspaceRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitWorkspaceRename();
                          if (e.key === 'Escape') cancelWorkspaceRename();
                        }}
                        className="w-full px-2.5 py-1.5 text-base rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelWorkspaceRename}
                          className="text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={submitWorkspaceRename}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={entry.key}
                    type="button"
                    {...wsMenu.bindTrigger(
                      { kind: 'workspace', entry },
                      () => handlePickWorkspace(entry),
                    )}
                    className={`
                      w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors
                      ${CONTEXT_MENU_TRIGGER_CLASS}
                      ${
                        active
                          ? 'bg-neutral-100 text-neutral-900 border-l-2 border-neutral-400 dark:bg-neutral-800 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-400 border-l-2 border-transparent hover:bg-stone-50 dark:hover:bg-stone-700/50'
                      }
                    `}
                  >
                    <span className="truncate">{entry.name}</span>
                  </button>
                );
              })}
            </div>
            {newWorkspaceOpen ? (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewWorkspace();
                    if (e.key === 'Escape') {
                      setNewWorkspaceOpen(false);
                      setNewWorkspaceName('');
                    }
                  }}
                  placeholder="Workspace name"
                  className="w-full px-2.5 py-1.5 text-base rounded-md border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setNewWorkspaceOpen(false);
                      setNewWorkspaceName('');
                    }}
                    className="text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitNewWorkspace}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewWorkspaceOpen(true)}
                className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline text-left"
              >
                + New workspace
              </button>
            )}
          </div>

          {authReady &&
          customAuthSession &&
          revenueCatReady &&
          !isSubscriptionStatusPending ? (
            <div className="mt-6 border-t border-stone-200 dark:border-stone-600 pt-3 px-1">
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(true)}
                className="w-full text-left text-sm font-medium text-stone-600 dark:text-stone-300 hover:underline"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <ConfirmDialog
        open={signOutConfirmOpen}
        title="Sign out?"
        description="You will be signed out on this device. Cloud sync will stop until you sign in again and turn sync back on."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        destructive
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={() => {
          setSignOutConfirmOpen(false);
          signOut();
          showToast('Signed out');
          onClose();
        }}
      />

      <ContextActionPopover
        open={wsMenu.menu.open}
        entered={wsMenu.entered}
        x={wsMenu.menu.x}
        y={wsMenu.menu.y}
        showDelete={
          wsMenu.menu.target?.kind === 'workspace' &&
          wsMenu.menu.target.entry.id !== 'home'
        }
        onRename={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'workspace') {
            setWorkspaceRenameTarget(t.entry);
            setWorkspaceRenameDraft(t.entry.name);
          }
        }}
        onDelete={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'workspace' && t.entry.id !== 'home') {
            setPendingDeleteWorkspace(t.entry);
          }
        }}
        onDismiss={wsMenu.closeMenu}
      />

      <ConfirmDialog
        open={pendingDeleteWorkspace != null}
        title="Delete workspace"
        description={
          pendingDeleteWorkspace
            ? `Delete “${pendingDeleteWorkspace.name}”? All notes in this workspace will be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDeleteWorkspace(null)}
        onConfirm={async () => {
          const w = pendingDeleteWorkspace;
          if (!w) return;
          const ok = await deleteVisibleWorkspace(w);
          if (ok) {
            setPendingDeleteWorkspace(null);
            navigate('/');
            onClose();
          } else {
            window.alert(
              'Could not delete this workspace. If you use cloud sync, check your connection and try again. If the problem continues, the database may need related notes removed first.',
            );
          }
        }}
      />
    </div>
  );
}
