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

export function ManagePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { load, deleteHiddenWorkspace, hydrationComplete, workspaceSwitchGeneration } =
    useWorkspace();
  const [workspaces, setWorkspaces] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');
  const [resetMasterKeyDialogOpen, setResetMasterKeyDialogOpen] = useState(false);
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

  const handleDelete = async (storageKey) => {
    if (!confirm('Delete this workspace? This cannot be undone.')) return;
    const ok = await deleteHiddenWorkspace(storageKey);
    if (ok) {
      refreshList();
    } else {
      window.alert(
        'Could not delete this workspace. If you use cloud sync, check your connection and try again. If the problem continues, the database may need related notes removed first.',
      );
    }
  };

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
      className={`space-y-6 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        pageExiting ? 'pointer-events-none opacity-0 scale-[0.99]' : 'opacity-100 scale-100'
      }`}
    >
      <div
        className={
          fromResetCodeVerified
            ? `transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                manageReveal ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              }`
            : ''
        }
      >
      <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-stone-200/90 dark:border-stone-600/80">
        <h2 className="text-xl font-semibold tracking-tight text-stone-800 dark:text-stone-100">
          Hidden Workspaces
        </h2>
        <button
          type="button"
          onClick={goToMainHome}
          className="shrink-0 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
        >
          ← Back
        </button>
      </div>

      <ul className="space-y-3 sm:space-y-3.5">
        {workspaces.map((entry) => {
          const { storageKey, displayName } = entry;
          const routeSlug = getWorkspaceNameFromKey(storageKey);
          const isEditing = editingKey === storageKey;
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-stone-200/90 bg-white shadow-sm shadow-stone-900/5 dark:border-stone-600 dark:bg-stone-800/90 dark:shadow-none"
            >
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(storageKey, editName);
                      if (e.key === 'Escape') setEditingKey(null);
                    }}
                    className="flex-1 px-2 py-1 text-base rounded border border-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(storageKey, editName)}
                    className="text-sm text-stone-600 dark:text-stone-400"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      // Apply workspace before route change so NotesView never paints prior notes.
                      load(routeSlug, null);
                      navigate(`/ws/${routeSlug}`);
                    }}
                    className="flex-1 text-left font-medium text-stone-800 dark:text-stone-200 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer py-1 -my-1 rounded focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
                  >
                    {displayName}
                  </button>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(storageKey);
                        setEditName(displayName);
                      }}
                      className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(storageKey)}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {workspaces.length === 0 && (
        <p className="py-8 px-1 text-center text-sm text-stone-500 dark:text-stone-400 rounded-xl border border-dashed border-stone-200 dark:border-stone-600 bg-stone-50/80 dark:bg-stone-900/40">
          No hidden workspaces yet.
        </p>
      )}

      <div className="pt-6 mt-2 border-t border-stone-200 dark:border-stone-600">
        <button
          type="button"
          onClick={() => setResetMasterKeyDialogOpen(true)}
          className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
        >
          Reset master key
        </button>
      </div>
      </div>

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
