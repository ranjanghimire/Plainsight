import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useSyncEntitlement } from '../context/SyncEntitlementContext';
import { useAuth } from '../context/AuthContext';
import {
  VISIBLE_WS_PREFIX,
  getOwnerSharedWorkspaceIdsCache,
  getOwnerSharedWorkspaceIdsForMenu,
} from '../utils/storage';
import {
  getSyncEntitled,
  getSyncRemoteActive,
  getOptimisticLastKnownSyncEntitledForMenu,
  hasCustomAuthSession,
  setSyncRemoteActive as persistSyncRemoteActive,
  shouldShowSharedWorkspacesMenuContent,
  subscribeSyncGating,
} from '../sync/syncEnabled';
import {
  useItemContextMenu,
  CONTEXT_MENU_TRIGGER_CLASS,
} from '../hooks/useItemContextMenu';
import { ContextActionPopover } from './ContextActionPopover';
import { ConfirmDialog } from './ConfirmDialog';
import { SignOutDataLossDialog } from './SignOutDataLossDialog';
import { ShareWorkspaceDialog } from './ShareWorkspaceDialog';
import { WorkspaceActivityLogDialog } from './WorkspaceActivityLogDialog';

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

/** Book / guide — menu footer Help row */
function HelpMenuGlyph({ className = '' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

/** Leave session — menu footer Sign out row */
function SignOutMenuGlyph({ className = '' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
      />
    </svg>
  );
}

const MENU_FOOTER_ROW =
  'group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-all duration-200 ease-out active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-stone-500/40 dark:focus-visible:ring-offset-stone-900';

const MENU_FOOTER_ROW_HELP =
  `${MENU_FOOTER_ROW} text-stone-700 hover:border-stone-200/90 hover:bg-white/85 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_3px_10px_rgba(15,23,42,0.05)] dark:text-stone-200 dark:hover:border-stone-600/70 dark:hover:bg-stone-800/55 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_6px_16px_rgba(0,0,0,0.18)]`;

const MENU_FOOTER_ROW_SIGNOUT =
  `${MENU_FOOTER_ROW} text-stone-600 hover:border-stone-200/80 hover:bg-stone-50/90 hover:shadow-[0_1px_0_rgba(15,23,42,0.03),0_2px_8px_rgba(15,23,42,0.04)] dark:text-stone-300 dark:hover:border-stone-600/60 dark:hover:bg-stone-800/40 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.15)]`;

const MENU_FOOTER_ICON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200/60 bg-gradient-to-b from-white to-stone-50/90 text-stone-500 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] transition-[border-color,box-shadow,color,background] duration-200 group-hover:border-stone-300/80 group-hover:from-stone-50 group-hover:to-stone-100/95 group-hover:text-stone-700 group-hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-stone-600/50 dark:from-stone-800/90 dark:to-stone-900/80 dark:text-stone-400 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:group-hover:border-stone-500/60 dark:group-hover:from-stone-700/80 dark:group-hover:to-stone-800/90 dark:group-hover:text-stone-200';

export function MenuButton({ onOpen, showNotification }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative p-2 -mr-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-700 transition-colors"
      aria-label="Open menu"
    >
      <MenuIcon className="w-6 h-6" />
      {showNotification ? (
        <span
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white dark:ring-stone-800"
          aria-hidden
        />
      ) : null}
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

/** Minimal hint: yours vs someone else's workspace (section title already says “shared”). */
function sharedWorkspaceRowHint(row) {
  if (row?.isOwner) {
    return { label: 'Yours', title: 'You share this workspace' };
  }
  const email = String(row?.ownerEmail || '').trim();
  if (!email) return { label: null, title: undefined };
  const at = email.indexOf('@');
  const local = at > 0 ? email.slice(0, at) : email;
  const label = local.length > 10 ? `${local.slice(0, 9)}…` : local;
  return { label, title: email };
}

export function MenuPanel({ open, onClose }) {
  const navigate = useNavigate();
  const { isDark, setIsDark } = useTheme();
  const {
    activeStorageKey,
    visibleWorkspaces,
    sharedWorkspaces,
    pendingSharedInvites,
    sharedWorkspaceUnread,
    clearSharedWorkspaceUnread,
    switchVisibleWorkspace,
    openSharedWorkspace,
    createVisibleWorkspace,
    renameVisibleWorkspace,
    getWorkspaceIdByVisibleEntry,
    shareVisibleWorkspace,
    acceptSharedWorkspaceInvite,
    makeWorkspacePrivateById,
    fetchWorkspaceActivityLog,
    deleteVisibleWorkspace,
    syncHydrationConnectivityWarning,
  } = useWorkspace();
  const {
    beginUpgradeFlow,
    showToast,
    revenueCatReady,
    isSubscriptionStatusPending,
    syncMenuConnectivityWarning,
  } = useSyncEntitlement();
  const { openSendCodeModal, signOut, authEmail, authReady, authConnectivityDegraded } =
    useAuth();
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
  const [shareWorkspaceTarget, setShareWorkspaceTarget] = useState(null);
  const [shareRecipientEmail, setShareRecipientEmail] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [pendingDeleteWorkspace, setPendingDeleteWorkspace] = useState(null);
  const [pendingMakePrivateWorkspace, setPendingMakePrivateWorkspace] = useState(null);
  const [logsWorkspaceTarget, setLogsWorkspaceTarget] = useState(null);
  const [sharedWorkspaceInfoRow, setSharedWorkspaceInfoRow] = useState(null);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const wsMenu = useItemContextMenu();

  const menuSyncRestoreHint = getOptimisticLastKnownSyncEntitledForMenu();
  /** Omit “Checking sign-in…” when tokens exist — session edge may be slow; menu uses amber sync dot instead. */
  const showAuthCheckingLine =
    !authReady && menuSyncRestoreHint === null && !customAuthSession;
  /** Signed-out shell only; if tokens exist we fall through to subscription / sync rows. */
  const optimisticFreeMenuWhileRestoring =
    !authReady && menuSyncRestoreHint === false && !customAuthSession;

  const syncStatusDotDegraded =
    authConnectivityDegraded ||
    syncHydrationConnectivityWarning ||
    syncMenuConnectivityWarning ||
    isSubscriptionStatusPending;

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
      if (sharedWorkspaceInfoRow) setSharedWorkspaceInfoRow(null);
      else if (wsMenu.menu.open) wsMenu.closeMenu();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, onClose, sharedWorkspaceInfoRow, wsMenu.menu.open, wsMenu.closeMenu]);

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

  const submitWorkspaceShare = async (emailInput) => {
    if (!shareWorkspaceTarget || shareBusy) return;
    const email = String(emailInput || '').trim();
    if (!email) return;
    if (authEmail && String(authEmail).trim().toLowerCase() === email.toLowerCase()) {
      showToast('You cannot share a workspace with your own email');
      return;
    }
    setShareBusy(true);
    try {
      const res = await shareVisibleWorkspace(shareWorkspaceTarget, email);
      if (!res?.ok) {
        showToast(res?.error?.message || 'Could not share workspace');
        return;
      }
      showToast(`Invite sent to ${email.toLowerCase()}`);
      setShareWorkspaceTarget(null);
      setShareRecipientEmail('');
    } finally {
      setShareBusy(false);
    }
  };

  /** Real shared list + actions (not free-plan blurb) — uses persisted hints so cold start matches last session. */
  const isPaidCollabEnabled = useMemo(
    () =>
      shouldShowSharedWorkspacesMenuContent({
        hasCustomAuthSession: customAuthSession,
        syncEntitled,
        syncRemoteActive,
        sharedRowCount: (sharedWorkspaces || []).length,
        pendingInviteCount: (pendingSharedInvites || []).length,
        ownerSharedWorkspaceIdCacheSize: getOwnerSharedWorkspaceIdsCache().size,
      }),
    [customAuthSession, syncEntitled, syncRemoteActive, sharedWorkspaces, pendingSharedInvites],
  );
  const canManageSharedWorkspace = (row) =>
    Boolean(
      row &&
        row.isOwner &&
        row.ownerEmail &&
        authEmail &&
        String(row.ownerEmail).trim().toLowerCase() ===
          String(authEmail).trim().toLowerCase(),
    );

  const ownerSharedWorkspaceIds = useMemo(
    () => getOwnerSharedWorkspaceIdsForMenu(sharedWorkspaces, customAuthSession),
    [sharedWorkspaces, customAuthSession],
  );

  /** Hide owned workspaces from WORKSPACES when they appear under SHARED WORKSPACES (accepted share). */
  const visibleWorkspacesForMenu = useMemo(
    () =>
      (visibleWorkspaces || []).filter((entry) => {
        if (entry?.id === 'home') return true;
        const wid = getWorkspaceIdByVisibleEntry(entry);
        if (!wid) return true;
        return !ownerSharedWorkspaceIds.has(String(wid));
      }),
    [visibleWorkspaces, ownerSharedWorkspaceIds, getWorkspaceIdByVisibleEntry],
  );

  const visibleEntryFromSharedOwnerRow = (row) => ({
    id: row.workspaceId,
    name: row.workspaceName,
    key: `${VISIBLE_WS_PREFIX}${row.workspaceId}`,
  });

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
                <div
                  className="flex items-center gap-2"
                  title={
                    syncStatusDotDegraded
                      ? 'Sync or sign-in may be delayed — still reconnecting.'
                      : undefined
                  }
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: syncStatusDotDegraded ? '#f59e0b' : '#4CAF50',
                    }}
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
              {visibleWorkspacesForMenu.map((entry) => {
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

          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-2">
              Shared Workspaces
            </h3>
            <div className="border-t border-stone-200 dark:border-stone-600 pt-2 space-y-1">
              {!isPaidCollabEnabled ? (
                <p className="px-1 py-1 text-xs text-stone-500 dark:text-stone-400">
                  Shared workspaces are available for paid users with cloud sync on.
                </p>
              ) : (
                <>
                  {(pendingSharedInvites || []).map((invite) => (
                    <div
                      key={invite.shareId}
                      className="rounded-md border border-dashed border-stone-300/80 bg-stone-50 px-2.5 py-2 dark:border-stone-600/80 dark:bg-stone-900/60"
                    >
                      <p className="truncate text-sm text-stone-800 dark:text-stone-100">
                        {invite.workspaceName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                        Invite from {invite.ownerEmail || 'workspace owner'}
                      </p>
                      <button
                        type="button"
                        className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={() => {
                          void (async () => {
                            const res = await acceptSharedWorkspaceInvite(invite.shareId);
                            if (!res?.ok) {
                              showToast(res?.error?.message || 'Could not accept invite');
                              return;
                            }
                            showToast(`Joined ${invite.workspaceName}`);
                          })();
                        }}
                      >
                        Accept
                      </button>
                    </div>
                  ))}

                  {(sharedWorkspaces || []).map((row) => {
                    const active = activeStorageKey === `${VISIBLE_WS_PREFIX}${row.workspaceId}`;
                    const hint = sharedWorkspaceRowHint(row);
                    const sharedKey = `${VISIBLE_WS_PREFIX}${row.workspaceId}`;
                    const isRenaming = workspaceRenameTarget?.key === sharedKey;
                    const hasUnread = Boolean(sharedWorkspaceUnread?.[String(row.workspaceId)]);
                    if (isRenaming) {
                      return (
                        <div key={row.workspaceId} className="flex flex-col gap-2 px-1 py-1">
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
                        key={row.workspaceId}
                        type="button"
                        {...wsMenu.bindTrigger(
                          {
                            kind: 'shared-workspace',
                            row: {
                              ...row,
                              canManage: canManageSharedWorkspace(row),
                            },
                          },
                          () => {
                            openSharedWorkspace(row.workspaceId);
                            clearSharedWorkspaceUnread(row.workspaceId);
                            navigate('/');
                            onClose();
                          },
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
                        <span className="truncate min-w-0">{row.workspaceName}</span>
                        {hasUnread || hint.label ? (
                          <span className="ml-auto flex items-center gap-2 min-w-0">
                            {hasUnread ? (
                              <span
                                className="shrink-0 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-stone-50 dark:ring-stone-800"
                                aria-label="Unread changes"
                                title="New activity"
                                role="img"
                              />
                            ) : null}
                            {hint.label ? (
                              <span
                                className="shrink-0 max-w-[5.5rem] truncate text-right text-[10px] font-medium text-stone-400 dark:text-stone-500"
                                title={hint.title}
                              >
                                {hint.label}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  {(pendingSharedInvites || []).length === 0 &&
                  (sharedWorkspaces || []).length === 0 ? (
                    <p className="px-1 py-1 text-xs text-stone-500 dark:text-stone-400">
                      No shared workspaces yet.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-stone-200/90 pt-4 dark:border-stone-600/80">
            <div className="flex flex-col gap-1.5 px-0.5">
              <button
                type="button"
                aria-label="Help"
                onClick={() => {
                  onClose();
                  navigate('/help');
                }}
                className={MENU_FOOTER_ROW_HELP}
              >
                <span className={MENU_FOOTER_ICON} aria-hidden>
                  <HelpMenuGlyph className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium tracking-tight text-stone-800 dark:text-stone-100">
                    Help
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-snug text-stone-500 dark:text-stone-400">
                    Guide &amp; how Plainsight works
                  </span>
                </span>
              </button>
              {customAuthSession && authEmail ? (
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => setSignOutConfirmOpen(true)}
                  className={MENU_FOOTER_ROW_SIGNOUT}
                >
                  <span className={MENU_FOOTER_ICON} aria-hidden>
                    <SignOutMenuGlyph className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium tracking-tight text-stone-800 dark:text-stone-100">
                      Sign out
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-stone-500 dark:text-stone-400">
                      Clears local device data
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      <SignOutDataLossDialog
        open={signOutConfirmOpen}
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={async () => {
          setSignOutConfirmOpen(false);
          onClose();
          showToast('Signing out…');
          await signOut();
        }}
      />

      <ContextActionPopover
        open={wsMenu.menu.open}
        entered={wsMenu.entered}
        x={wsMenu.menu.x}
        y={wsMenu.menu.y}
        showRename={
          wsMenu.menu.target?.kind === 'workspace' ||
          (wsMenu.menu.target?.kind === 'shared-workspace' &&
            wsMenu.menu.target.row?.isOwner)
        }
        showDelete={
          (wsMenu.menu.target?.kind === 'workspace' &&
            wsMenu.menu.target.entry.id !== 'home') ||
          (wsMenu.menu.target?.kind === 'shared-workspace' &&
            wsMenu.menu.target.row?.isOwner)
        }
        showShare={
          isPaidCollabEnabled &&
          ((wsMenu.menu.target?.kind === 'workspace' &&
            wsMenu.menu.target.entry.id !== 'home') ||
            (wsMenu.menu.target?.kind === 'shared-workspace' &&
              wsMenu.menu.target.row?.isOwner))
        }
        showLogs={wsMenu.menu.target?.kind === 'shared-workspace'}
        showInfo={
          wsMenu.menu.target?.kind === 'shared-workspace' &&
          !wsMenu.menu.target.row?.isOwner &&
          Boolean(String(wsMenu.menu.target.row?.ownerEmail || '').trim())
        }
        showMakePrivate={
          wsMenu.menu.target?.kind === 'shared-workspace' &&
          wsMenu.menu.target.row.canManage
        }
        renameLabel="Rename"
        deleteLabel="Delete"
        shareLabel="Share"
        logsLabel="Logs"
        makePrivateLabel="Make private"
        onRename={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'workspace') {
            setWorkspaceRenameTarget(t.entry);
            setWorkspaceRenameDraft(t.entry.name);
          } else if (t?.kind === 'shared-workspace') {
            const entry = visibleEntryFromSharedOwnerRow(t.row);
            setWorkspaceRenameTarget(entry);
            setWorkspaceRenameDraft(entry.name);
          }
        }}
        onShare={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'workspace') {
            setShareWorkspaceTarget(t.entry);
            setShareRecipientEmail('');
          } else if (t?.kind === 'shared-workspace' && t.row?.isOwner) {
            setShareWorkspaceTarget(visibleEntryFromSharedOwnerRow(t.row));
            setShareRecipientEmail('');
          }
        }}
        onLogs={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'shared-workspace') {
            setLogsWorkspaceTarget(t.row);
          }
        }}
        onInfo={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'shared-workspace') setSharedWorkspaceInfoRow(t.row);
        }}
        onMakePrivate={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'shared-workspace' && t.row.canManage) {
            setPendingMakePrivateWorkspace(t.row);
          }
        }}
        onDelete={() => {
          const t = wsMenu.menu.target;
          if (t?.kind === 'workspace' && t.entry.id !== 'home') {
            setPendingDeleteWorkspace(t.entry);
          } else if (t?.kind === 'shared-workspace' && t.row?.isOwner) {
            setPendingDeleteWorkspace(visibleEntryFromSharedOwnerRow(t.row));
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

      <ConfirmDialog
        open={pendingMakePrivateWorkspace != null}
        title="Make workspace private?"
        description={
          pendingMakePrivateWorkspace
            ? `Stop sharing “${pendingMakePrivateWorkspace.workspaceName}” with all collaborators? They will lose access immediately.`
            : ''
        }
        confirmLabel="Make private"
        destructive
        onCancel={() => setPendingMakePrivateWorkspace(null)}
        onConfirm={async () => {
          const row = pendingMakePrivateWorkspace;
          if (!row) return;
          const res = await makeWorkspacePrivateById(row.workspaceId);
          if (!res?.ok) {
            showToast(res?.error?.message || 'Could not make workspace private');
            return;
          }
          setPendingMakePrivateWorkspace(null);
          showToast('Workspace is private again');
        }}
      />

      <ShareWorkspaceDialog
        open={shareWorkspaceTarget != null}
        workspaceName={shareWorkspaceTarget?.name || ''}
        busy={shareBusy}
        initialEmail={shareRecipientEmail}
        onClose={() => {
          if (shareBusy) return;
          setShareWorkspaceTarget(null);
          setShareRecipientEmail('');
        }}
        onSubmit={async (email) => {
          await submitWorkspaceShare(email);
        }}
      />

      <WorkspaceActivityLogDialog
        open={logsWorkspaceTarget != null}
        workspaceName={logsWorkspaceTarget?.workspaceName || ''}
        workspaceId={logsWorkspaceTarget?.workspaceId || ''}
        fetchLogs={fetchWorkspaceActivityLog}
        onClose={() => setLogsWorkspaceTarget(null)}
      />

      {sharedWorkspaceInfoRow && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/60"
              role="presentation"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Dismiss"
                onClick={() => setSharedWorkspaceInfoRow(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Shared workspace"
                className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
                    Shared workspace
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSharedWorkspaceInfoRow(null)}
                    className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                    aria-label="Close"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  This workspace was shared to you by{' '}
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    {String(sharedWorkspaceInfoRow.ownerEmail || '').trim()}
                  </span>
                  .
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSharedWorkspaceInfoRow(null)}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
