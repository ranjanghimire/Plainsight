import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import {
  getWorkspaceKey,
  getWorkspaceNameFromKey,
  loadWorkspace,
  saveWorkspace,
  getDefaultWorkspaceData,
} from '../utils/storage';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [currentWorkspace, setCurrentWorkspace] = useState('home');
  const [data, setData] = useState(() => loadWorkspace('workspace_home'));

  const workspaceKey = getWorkspaceKey(currentWorkspace);

  const load = useCallback((name) => {
    const key = getWorkspaceKey(name);
    setData(loadWorkspace(key));
    setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
  }, []);

  const save = useCallback(() => {
    saveWorkspace(workspaceKey, data);
  }, [workspaceKey, data]);

  useEffect(() => {
    save();
  }, [data, workspaceKey, save]);

  const switchWorkspace = useCallback((name) => {
    const key = getWorkspaceKey(name);
    let nextData = loadWorkspace(key);
    if (!nextData.notes?.length && !nextData.categories?.length) {
      nextData = getDefaultWorkspaceData();
      saveWorkspace(key, nextData);
    }
    setData(nextData);
    setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
  }, []);

  const addNote = useCallback((text, category = null) => {
    const id = crypto.randomUUID?.() ?? `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setData((prev) => ({
      ...prev,
      notes: [...(prev.notes || []), { id, text, category }],
    }));
    return id;
  }, []);

  const updateNote = useCallback((id, updates) => {
    setData((prev) => ({
      ...prev,
      notes: (prev.notes || []).map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    }));
  }, []);

  const deleteNote = useCallback((id) => {
    setData((prev) => ({
      ...prev,
      notes: (prev.notes || []).filter((n) => n.id !== id),
    }));
  }, []);

  const addCategory = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setData((prev) => {
      const cats = prev.categories || [];
      if (cats.includes(trimmed)) return prev;
      return { ...prev, categories: [...cats, trimmed] };
    });
  }, []);

  const deleteCategory = useCallback((name) => {
    setData((prev) => ({
      ...prev,
      categories: (prev.categories || []).filter((c) => c !== name),
      notes: (prev.notes || []).map((n) =>
        n.category === name ? { ...n, category: null } : n
      ),
    }));
  }, []);

  const renameCategory = useCallback((oldName, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    setData((prev) => ({
      ...prev,
      categories: (prev.categories || []).map((c) => (c === oldName ? trimmed : c)),
      notes: (prev.notes || []).map((n) =>
        n.category === oldName ? { ...n, category: trimmed } : n
      ),
    }));
  }, []);

  const value = {
    currentWorkspace,
    workspaceKey,
    data,
    load,
    save,
    switchWorkspace,
    addNote,
    updateNote,
    deleteNote,
    addCategory,
    deleteCategory,
    renameCategory,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
