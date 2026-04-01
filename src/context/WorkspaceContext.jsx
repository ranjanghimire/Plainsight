import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  getWorkspaceKey,
  getWorkspaceNameFromKey,
  loadWorkspace,
  saveWorkspace,
  getDefaultWorkspaceData,
  loadAppState,
  saveAppStatePartial,
  VISIBLE_WS_PREFIX,
  getOrCreateWorkspaceIdForStorageKey,
  setWorkspaceIdMapping,
} from '../utils/storage';
import { queueFullSync } from '../sync/syncHelpers';
import { supabase } from '../sync/supabaseClient';
import {
  getLocalNoteTombstones,
  getLocalWorkspaces,
  saveLocalNoteTombstones,
  saveLocalWorkspaces,
} from '../sync/localDB';

async function ensureWorkspaceRow({ storageKey, name, kind }) {
  const now = new Date().toISOString();
  const id = getOrCreateWorkspaceIdForStorageKey(storageKey);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const row = {
    id,
    owner_id: user.id,
    name,
    kind,
    created_at: now,
    updated_at: now,
  };

  const existing = await getLocalWorkspaces();
  const idx = existing.findIndex((w) => w.id === id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...row, owner_id: user.id };
  } else {
    next.push(row);
  }
  await saveLocalWorkspaces(next);
}

const WorkspaceContext = createContext(null);

function isWorkspaceDataEmpty(d) {
  return (
    !d.notes?.length &&
    !d.categories?.length &&
    !Object.keys(d.archivedNotes || {}).length
  );
}

export function WorkspaceProvider({ children }) {
  const appInitial = loadAppState();
  const initialKey = appInitial.lastActiveStorageKey || 'workspace_home';
  let initialData = loadWorkspace(initialKey);
  if (isWorkspaceDataEmpty(initialData)) {
    initialData = getDefaultWorkspaceData();
    saveWorkspace(initialKey, initialData);
  }

  const [activeStorageKey, setActiveStorageKey] = useState(initialKey);
  const [visibleWorkspaces, setVisibleWorkspaces] = useState(
    appInitial.visibleWorkspaces,
  );
  const [data, setData] = useState(initialData);
  const [currentWorkspace, setCurrentWorkspace] = useState(() => {
    if (initialKey === 'workspace_home') return 'home';
    if (initialKey.startsWith(VISIBLE_WS_PREFIX)) {
      const entry = appInitial.visibleWorkspaces.find(
        (e) => e.key === initialKey,
      );
      if (entry?.id === 'home') return 'home';
      return entry ? `visible:${entry.id}` : 'home';
    }
    return getWorkspaceNameFromKey(initialKey);
  });
  const [workspaceSwitchGeneration, setWorkspaceSwitchGeneration] = useState(0);

  const workspaceKey = activeStorageKey;

  const bumpWorkspaceSwitch = useCallback(() => {
    setWorkspaceSwitchGeneration((g) => g + 1);
  }, []);

  const save = useCallback(() => {
    saveWorkspace(activeStorageKey, data);
  }, [activeStorageKey, data]);

  useEffect(() => {
    save();
  }, [data, activeStorageKey, save]);

  useEffect(() => {
    const key = activeStorageKey;
    const isHome = key === 'workspace_home';
    const visibleEntry = visibleWorkspaces.find((e) => e.key === key);
    const name = isHome
      ? 'Home'
      : visibleEntry
        ? visibleEntry.name
        : getWorkspaceNameFromKey(key);
    const kind = visibleEntry ? 'visible' : isHome ? 'visible' : 'hidden';
    void ensureWorkspaceRow({ storageKey: key, name, kind });
  }, [activeStorageKey, visibleWorkspaces]);

  useEffect(() => {
    const onSync = () => {
      const app = loadAppState();
      setVisibleWorkspaces(app.visibleWorkspaces);
      setData(loadWorkspace(activeStorageKey));
    };
    window.addEventListener('plainsight:full-sync', onSync);
    return () => window.removeEventListener('plainsight:full-sync', onSync);
  }, [activeStorageKey]);

  const load = useCallback(
    (name) => {
      const key = getWorkspaceKey(name);
      let nextData = loadWorkspace(key);
      if (isWorkspaceDataEmpty(nextData)) {
        nextData = getDefaultWorkspaceData();
        saveWorkspace(key, nextData);
        // Hidden/dot workspaces are created lazily on first open.
        void ensureWorkspaceRow({
          storageKey: key,
          name: name === 'home' ? 'Home' : name,
          kind: name === 'home' ? 'visible' : 'hidden',
        });
      }
      setActiveStorageKey(key);
      setData(nextData);
      setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
      saveAppStatePartial({ lastActiveStorageKey: key });
      bumpWorkspaceSwitch();
      queueFullSync();
    },
    [bumpWorkspaceSwitch],
  );

  const switchWorkspace = useCallback(
    (name) => {
      const key = getWorkspaceKey(name);
      let nextData = loadWorkspace(key);
      if (isWorkspaceDataEmpty(nextData)) {
        nextData = getDefaultWorkspaceData();
        saveWorkspace(key, nextData);
        void ensureWorkspaceRow({
          storageKey: key,
          name: name === 'home' ? 'Home' : name,
          kind: name === 'home' ? 'visible' : 'hidden',
        });
      }
      setActiveStorageKey(key);
      setData(nextData);
      setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
      saveAppStatePartial({ lastActiveStorageKey: key });
      bumpWorkspaceSwitch();
      queueFullSync();
    },
    [bumpWorkspaceSwitch],
  );

  const switchVisibleWorkspace = useCallback(
    (entry) => {
      let nextData = loadWorkspace(entry.key);
      if (isWorkspaceDataEmpty(nextData)) {
        nextData = getDefaultWorkspaceData();
        saveWorkspace(entry.key, nextData);
        void ensureWorkspaceRow({
          storageKey: entry.key,
          name: entry.name,
          kind: 'visible',
        });
      }
      setActiveStorageKey(entry.key);
      setData(nextData);
      setCurrentWorkspace(entry.id === 'home' ? 'home' : `visible:${entry.id}`);
      saveAppStatePartial({ lastActiveStorageKey: entry.key });
      bumpWorkspaceSwitch();
      queueFullSync();
    },
    [bumpWorkspaceSwitch],
  );

  const createVisibleWorkspace = useCallback(
    (displayName) => {
      const name = displayName.trim();
      if (!name) return null;
      const id = uuidv4();
      const key = `${VISIBLE_WS_PREFIX}${id}`;
      setWorkspaceIdMapping(key, id);
      const fresh = getDefaultWorkspaceData();
      saveWorkspace(key, fresh);
      const entry = { id, name, key };
      // Create the workspace row (with owner_id) at creation time.
      void ensureWorkspaceRow({ storageKey: key, name, kind: 'visible' });
      setVisibleWorkspaces((prev) => {
        const next = [...prev, entry];
        saveAppStatePartial({
          visibleWorkspaces: next,
          lastActiveStorageKey: key,
        });
        return next;
      });
      setActiveStorageKey(key);
      setData(fresh);
      setCurrentWorkspace(`visible:${id}`);
      bumpWorkspaceSwitch();
      queueFullSync();
      return entry;
    },
    [bumpWorkspaceSwitch],
  );

  const addNote = useCallback((text, category = null) => {
    const now = new Date().toISOString();
    const id = uuidv4();
    setData((prev) => ({
      ...prev,
      notes: [
        { id, text, category, createdAt: now, updatedAt: now },
        ...(prev.notes || []),
      ],
    }));
    queueFullSync();
    return id;
  }, []);

  const updateNote = useCallback((id, updates) => {
    const now = new Date().toISOString();
    setData((prev) => ({
      ...prev,
      notes: (prev.notes || []).map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: now } : n,
      ),
    }));
    queueFullSync();
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
    // Record a tombstone so sync can delete the Supabase row.
    try {
      const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
      const deletedAt = new Date().toISOString();
      void (async () => {
        const existing = await getLocalNoteTombstones(workspaceId);
        const next = [
          { id, workspace_id: workspaceId, deleted_at: deletedAt },
          ...existing.filter((t) => t.id !== id),
        ];
        await saveLocalNoteTombstones(workspaceId, next);
      })();
    } catch {
      /* ignore */
    }
    queueFullSync();
  }, [activeStorageKey]);

  const restoreArchivedNote = useCallback((textKey, resolvedCategory) => {
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      const entry = arch[textKey];
      if (!entry) return prev;
      delete arch[textKey];
      const now = new Date().toISOString();
      const id = uuidv4();
      const note = {
        id,
        text: entry.text,
        category:
          resolvedCategory === undefined || resolvedCategory === null
            ? null
            : resolvedCategory,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...prev,
        archivedNotes: arch,
        notes: [note, ...(prev.notes || [])],
      };
    });
    queueFullSync();
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
    queueFullSync();
  }, []);

  const permanentlyDeleteArchived = useCallback((textKey) => {
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      if (!arch[textKey]) return prev;
      delete arch[textKey];
      return { ...prev, archivedNotes: arch };
    });
    queueFullSync();
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
    queueFullSync();
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
          n.category === name ? { ...n, category: null } : n,
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
          c === oldName ? trimmed : c,
        ),
        notes: (prev.notes || []).map((n) =>
          n.category === oldName ? { ...n, category: trimmed } : n,
        ),
        archivedNotes: arch,
      };
    });
  }, []);

  const value = {
    currentWorkspace,
    workspaceKey,
    activeStorageKey,
    data,
    visibleWorkspaces,
    workspaceSwitchGeneration,
    load,
    save,
    switchWorkspace,
    switchVisibleWorkspace,
    createVisibleWorkspace,
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
