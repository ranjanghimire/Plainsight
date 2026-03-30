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
    if (
      !nextData.notes?.length &&
      !nextData.categories?.length &&
      !Object.keys(nextData.archivedNotes || {}).length
    ) {
      nextData = getDefaultWorkspaceData();
      saveWorkspace(key, nextData);
    }
    setData(nextData);
    setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
  }, []);

  const addNote = useCallback((text, category = null) => {
    const id = crypto.randomUUID?.() ?? `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdAt = new Date().toISOString();
    setData((prev) => ({
      ...prev,
      notes: [{ id, text, category, createdAt }, ...(prev.notes || [])],
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
    setData((prev) => {
      const n = (prev.notes || []).find((x) => x.id === id);
      if (!n) return prev;
      const textKey = n.text;
      const now = Date.now();
      const arch = { ...(prev.archivedNotes || {}) };
      const existing = arch[textKey];
      if (existing) {
        arch[textKey] = { ...existing, lastDeletedAt: now };
      } else {
        const cat =
          n.category === undefined || n.category === null || n.category === ''
            ? undefined
            : n.category;
        arch[textKey] = { text: textKey, category: cat, lastDeletedAt: now };
      }
      return {
        ...prev,
        notes: (prev.notes || []).filter((x) => x.id !== id),
        archivedNotes: arch,
      };
    });
  }, []);

  const restoreArchivedNote = useCallback((textKey, resolvedCategory) => {
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      const entry = arch[textKey];
      if (!entry) return prev;
      delete arch[textKey];
      const id =
        crypto.randomUUID?.() ??
        `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const createdAt = new Date(Date.now()).toISOString();
      const note = {
        id,
        text: entry.text,
        category:
          resolvedCategory === undefined || resolvedCategory === null
            ? null
            : resolvedCategory,
        createdAt,
      };
      return {
        ...prev,
        archivedNotes: arch,
        notes: [note, ...(prev.notes || [])],
      };
    });
  }, []);

  const updateArchivedNote = useCallback((textKey, updates) => {
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      const entry = arch[textKey];
      if (!entry) return prev;
      const nextText = updates.text !== undefined ? updates.text : entry.text;
      const nextCat =
        updates.category !== undefined ? updates.category : entry.category;
      if (nextText !== textKey) {
        delete arch[textKey];
        arch[nextText] = {
          text: nextText,
          category: nextCat,
          lastDeletedAt: entry.lastDeletedAt,
        };
      } else {
        arch[textKey] = {
          text: nextText,
          category: nextCat,
          lastDeletedAt: entry.lastDeletedAt,
        };
      }
      return { ...prev, archivedNotes: arch };
    });
  }, []);

  const permanentlyDeleteArchived = useCallback((textKey) => {
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      if (!arch[textKey]) return prev;
      delete arch[textKey];
      return { ...prev, archivedNotes: arch };
    });
  }, []);

  const removeArchivedByTextKeys = useCallback((textKeys) => {
    if (!textKeys?.length) return;
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      for (const k of textKeys) {
        delete arch[k];
      }
      return { ...prev, archivedNotes: arch };
    });
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
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      for (const [k, v] of Object.entries(arch)) {
        if (v.category === name) {
          arch[k] = { ...v, category: undefined };
        }
      }
      return {
        ...prev,
        categories: (prev.categories || []).filter((c) => c !== name),
        notes: (prev.notes || []).map((n) =>
          n.category === name ? { ...n, category: null } : n
        ),
        archivedNotes: arch,
      };
    });
  }, []);

  const renameCategory = useCallback((oldName, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      for (const [k, v] of Object.entries(arch)) {
        if (v.category === oldName) {
          arch[k] = { ...v, category: trimmed };
        }
      }
      return {
        ...prev,
        categories: (prev.categories || []).map((c) =>
          c === oldName ? trimmed : c
        ),
        notes: (prev.notes || []).map((n) =>
          n.category === oldName ? { ...n, category: trimmed } : n
        ),
        archivedNotes: arch,
      };
    });
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
    restoreArchivedNote,
    updateArchivedNote,
    permanentlyDeleteArchived,
    removeArchivedByTextKeys,
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

// Fast refresh: hook is colocated with provider for this app.
// eslint-disable-next-line react-refresh/only-export-components -- useWorkspace is the public API
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
