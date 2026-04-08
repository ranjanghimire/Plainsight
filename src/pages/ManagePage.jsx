import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  getHiddenWorkspaceManageEntries,
  getWorkspaceNameFromKey,
  loadWorkspace,
  saveWorkspace,
  deleteWorkspace,
  clearMasterKey,
} from '../utils/storage';

export function ManagePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { load, deleteHiddenWorkspace, hydrationComplete, workspaceSwitchGeneration } =
    useWorkspace();
  const [workspaces, setWorkspaces] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');

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

  const handleResetMasterKey = () => {
    clearMasterKey();
    goToMainHome();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-stone-800 dark:text-stone-200">Workspaces</h2>
        <button
          type="button"
          onClick={goToMainHome}
          className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          ← Back
        </button>
      </div>

      <ul className="space-y-3">
        {workspaces.map((entry) => {
          const { storageKey, displayName } = entry;
          const routeSlug = getWorkspaceNameFromKey(storageKey);
          const isEditing = editingKey === storageKey;
          return (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800"
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
                    onClick={() => navigate(`/ws/${routeSlug}`)}
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
        <p className="text-stone-500 dark:text-stone-400 text-sm">No hidden workspaces yet.</p>
      )}

      <div className="pt-4 border-t border-stone-200 dark:border-stone-600">
        <button
          type="button"
          onClick={handleResetMasterKey}
          className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          Reset master key
        </button>
      </div>
    </div>
  );
}
