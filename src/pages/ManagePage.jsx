import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  getHiddenWorkspaceManageEntries,
  getWorkspaceNameFromKey,
  loadWorkspace,
  saveWorkspace,
  deleteWorkspace,
  clearMasterKey,
} from '../utils/storage';

const MANAGE_EXIT_MS = 320;

function ChevronLeftIcon({ className, ...rest }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden {...rest}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function KeyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  );
}

function LockOpenIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
      />
    </svg>
  );
}

const iconBtnBase =
  'inline-flex shrink-0 items-center justify-center rounded-xl border transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900';

export function ManagePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { load, deleteHiddenWorkspace, hydrationComplete, workspaceSwitchGeneration } =
    useWorkspace();
  const [workspaces, setWorkspaces] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [resetMasterKeyDialogOpen, setResetMasterKeyDialogOpen] = useState(false);
  const [workspaceDeleteTarget, setWorkspaceDeleteTarget] = useState(null);
  const [pageExiting, setPageExiting] = useState(false);
  const resetExitTimerRef = useRef(null);

  const fromResetCodeVerified = useMemo(
    () => Boolean(location.state?.fromMasterKeyResetCode),
    [location.state?.fromMasterKeyResetCode],
  );
  const [manageReveal, setManageReveal] = useState(() => !fromResetCodeVerified);

  useEffect(() => {
    if (!fromResetCodeVerified) {
      setManageReveal(true);
      return undefined;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setManageReveal(true));
    });
    const t = window.setTimeout(() => {
      navigate('/manage', { replace: true, state: {} });
    }, 520);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [fromResetCodeVerified, navigate]);

  const refreshList = useCallback(() => {
    setWorkspaces(getHiddenWorkspaceManageEntries());
  }, []);

  const goToMainHome = () => {
    load('home');
    navigate('/');
  };

  useEffect(() => {
    refreshList();
    const onSync = () => refreshList();
    window.addEventListener('plainsight:full-sync', onSync);
    return () => window.removeEventListener('plainsight:full-sync', onSync);
  }, [refreshList]);

  useEffect(() => {
    refreshList();
  }, [location.pathname, hydrationComplete, workspaceSwitchGeneration, refreshList]);

  useEffect(
    () => () => {
      if (resetExitTimerRef.current != null) {
        window.clearTimeout(resetExitTimerRef.current);
        resetExitTimerRef.current = null;
      }
    },
    [],
  );

  const handleRename = (storageKey, newName) => {
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug) return;
    const newKey =
      storageKey === 'workspace_home' ? 'workspace_home' : `workspace_${slug}`;
    if (newKey === storageKey) {
      setEditingKey(null);
      return;
    }
    const data = loadWorkspace(storageKey);
    saveWorkspace(newKey, data);
    deleteWorkspace(storageKey);
    setWorkspaces((prev) =>
      prev.map((e) => (e.storageKey === storageKey ? { ...e, storageKey: newKey } : e)),
    );
    setEditingKey(null);
  };

  const handleConfirmDeleteWorkspace = useCallback(async () => {
    const target = workspaceDeleteTarget;
    setWorkspaceDeleteTarget(null);
    if (!target) return;
    const ok = await deleteHiddenWorkspace(target.storageKey);
    if (ok) {
      refreshList();
    } else {
      window.alert(
        'Could not delete this workspace. If you use cloud sync, check your connection and try again. If the problem continues, the database may need related notes removed first.',
      );
    }
  }, [workspaceDeleteTarget, deleteHiddenWorkspace, refreshList]);

  const finishResetMasterKey = useCallback(() => {
    clearMasterKey();
    load('home');
    navigate('/', { state: { fromMasterKeyReset: true } });
  }, [load, navigate]);

  const handleConfirmResetMasterKey = useCallback(() => {
    setResetMasterKeyDialogOpen(false);
    setPageExiting(true);
    if (resetExitTimerRef.current != null) window.clearTimeout(resetExitTimerRef.current);
    resetExitTimerRef.current = window.setTimeout(() => {
      resetExitTimerRef.current = null;
      finishResetMasterKey();
    }, MANAGE_EXIT_MS);
  }, [finishResetMasterKey]);

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        pageExiting ? 'pointer-events-none opacity-0 scale-[0.99]' : 'opacity-100 scale-100'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] dark:opacity-20"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[min(28rem,55vh)] w-[120%] rounded-[100%] bg-gradient-to-b from-violet-100/35 via-transparent to-transparent blur-3xl dark:from-violet-900/15" />
        <div className="absolute -right-1/4 bottom-0 h-[min(24rem,45vh)] w-[110%] rounded-[100%] bg-gradient-to-t from-stone-200/35 via-transparent to-transparent blur-3xl dark:from-stone-800/20" />
      </div>

      <div
        className={`relative mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 pb-16 pt-2 sm:px-5 ${
          fromResetCodeVerified
            ? `transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                manageReveal ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              }`
            : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 pb-5 dark:border-stone-700/80">
          <button
            type="button"
            onClick={goToMainHome}
            aria-label="← Back"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/80 dark:hover:text-stone-100"
          >
            <ChevronLeftIcon className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            <span>Back</span>
          </button>
          <button
            type="button"
            onClick={() => setResetMasterKeyDialogOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300/90 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:hover:border-stone-500 dark:hover:bg-stone-700/90"
          >
            <KeyIcon className="h-4 w-4 text-amber-700 dark:text-amber-400/90" />
            Reset master key
          </button>
        </div>

        <header className="pt-8 pb-2 sm:pt-10">
          <h2 className="font-header text-xl font-medium tracking-[0.06em] text-stone-800 dark:text-stone-100 sm:text-2xl">
            Hidden Workspaces
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            Spaces that stay out of the main menu. Open one to work there, or rename and remove them here.
          </p>
        </header>

        <ul className="mt-8 space-y-3">
          {workspaces.map((entry) => {
            const { storageKey, displayName } = entry;
            const routeSlug = getWorkspaceNameFromKey(storageKey);
            const isEditing = editingKey === storageKey;
            return (
              <li key={entry.id}>
                <div
                  className={`rounded-2xl border border-stone-200/90 bg-white/95 p-1 shadow-sm shadow-stone-900/[0.04] ring-1 ring-stone-900/[0.03] backdrop-blur-sm transition-shadow dark:border-stone-600/80 dark:bg-stone-800/95 dark:shadow-none dark:ring-white/[0.04] ${
                    isEditing ? 'ring-2 ring-stone-300/80 dark:ring-stone-500/40' : 'hover:shadow-md hover:shadow-stone-900/[0.06] dark:hover:ring-stone-500/20'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-2 sm:p-3.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(storageKey, editName);
                          if (e.key === 'Escape') setEditingKey(null);
                        }}
                        className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50/90 px-3 py-2.5 text-base text-stone-900 shadow-inner shadow-stone-900/[0.02] placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/30 dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-500/25"
                        autoFocus
                      />
                      <div className="flex shrink-0 items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingKey(null)}
                          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700/80"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRename(storageKey, editName)}
                          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-stretch gap-1 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          load(routeSlug, null);
                          navigate(`/ws/${routeSlug}`);
                        }}
                        className="min-w-0 flex-1 rounded-xl px-3 py-3.5 text-left text-base font-medium text-stone-800 transition-colors hover:bg-stone-50/90 dark:text-stone-100 dark:hover:bg-stone-700/40 sm:px-4 sm:py-4"
                      >
                        <span className="block truncate">{displayName}</span>
                        <span className="mt-0.5 block text-xs font-normal text-stone-400 dark:text-stone-500">
                          Tap to open
                        </span>
                      </button>
                      <div
                        className="flex shrink-0 flex-col justify-center gap-1 border-l border-stone-100 py-2 pr-2 pl-1 dark:border-stone-700/80 sm:flex-row sm:items-center sm:py-2 sm:pr-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingKey(storageKey);
                            setEditName(displayName);
                          }}
                          title="Rename workspace"
                          aria-label="Rename"
                          className={`${iconBtnBase} h-10 w-10 border-stone-200/90 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-800 focus-visible:ring-stone-400/40 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:bg-stone-700 dark:hover:text-stone-100`}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWorkspaceDeleteTarget({ storageKey, displayName })}
                          title="Delete workspace"
                          aria-label="Delete"
                          className={`${iconBtnBase} h-10 w-10 border-red-200/80 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 focus-visible:ring-red-400/35 dark:border-red-900/50 dark:bg-stone-800/80 dark:text-red-400 dark:hover:border-red-800/60 dark:hover:bg-red-950/35`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {workspaces.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/80 px-6 py-12 text-center dark:border-stone-600/70 dark:bg-stone-900/35">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-200/60 text-stone-500 dark:bg-stone-700/60 dark:text-stone-400">
              <LockOpenIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-stone-700 dark:text-stone-200">No hidden workspaces yet</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              Create one from the composer with a dot command, then it will appear here.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={workspaceDeleteTarget != null}
        title="Delete this workspace?"
        description={
          workspaceDeleteTarget
            ? `“${workspaceDeleteTarget.displayName}” will be removed from this device. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete workspace"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setWorkspaceDeleteTarget(null)}
        onConfirm={() => void handleConfirmDeleteWorkspace()}
      />

      <ConfirmDialog
        open={resetMasterKeyDialogOpen}
        title="Reset master key?"
        description="This removes the saved master key on this device. You will return to Home and can set a new key when you next need protected access."
        confirmLabel="Reset and go home"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setResetMasterKeyDialogOpen(false)}
        onConfirm={handleConfirmResetMasterKey}
      />
    </div>
  );
}
