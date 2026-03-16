import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllWorkspaceKeys, getWorkspaceNameFromKey, loadWorkspace, saveWorkspace, deleteWorkspace, clearMasterKey } from '../utils/storage';

export function ManagePage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const keys = getAllWorkspaceKeys().filter((k) => k !== 'workspace_home');
    setWorkspaces(keys);
  }, []);

  const handleRename = (key, newName) => {
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug) return;
    const newKey = key === 'workspace_home' ? 'workspace_home' : `workspace_${slug}`;
    if (newKey === key) {
      setEditingKey(null);
      return;
    }
    const data = loadWorkspace(key);
    saveWorkspace(newKey, data);
    deleteWorkspace(key);
    setWorkspaces((prev) => prev.map((k) => (k === key ? newKey : k)));
    setEditingKey(null);
  };

  const handleDelete = (key) => {
    if (confirm('Delete this workspace? This cannot be undone.')) {
      deleteWorkspace(key);
      setWorkspaces((prev) => prev.filter((k) => k !== key));
    }
  };

  const handleResetMasterKey = () => {
    clearMasterKey();
    navigate('/');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-stone-800 dark:text-stone-200">Workspaces</h2>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
        >
          ← Back
        </button>
      </div>

      <ul className="space-y-3">
        {workspaces.map((key) => {
          const name = getWorkspaceNameFromKey(key);
          const isEditing = editingKey === key;
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-800"
            >
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(key, editName);
                      if (e.key === 'Escape') setEditingKey(null);
                    }}
                    className="flex-1 px-2 py-1 rounded border border-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(key, editName)}
                    className="text-sm text-stone-600 dark:text-stone-400"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <span className="font-medium text-stone-800 dark:text-stone-200">{name}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKey(key);
                        setEditName(name);
                      }}
                      className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(key)}
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
