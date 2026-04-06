import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  getWorkspaceKey,
  getWorkspaceNameFromKey,
  loadWorkspace,
  saveWorkspace,
  deleteWorkspace,
  getDefaultWorkspaceData,
  loadAppState,
  saveAppStatePartial,
  VISIBLE_WS_PREFIX,
  getOrCreateWorkspaceIdForStorageKey,
  getWorkspaceIdForStorageKey,
  removeWorkspaceIdMapping,
  setWorkspaceIdMapping,
} from '../utils/storage';
import { queueFullSync } from '../sync/syncHelpers';
import { syncEnabled } from '../sync/syncEnabled';
import { deleteWorkspaceRemote } from '../sync/syncEngine';
import { subscribeHydrationComplete } from '../sync/hydrationBridge';
import { supabase } from '../sync/supabaseClient';
import {
  getLocalArchivedNoteTombstones,
  getLocalNoteTombstones,
  getLocalWorkspaces,
  saveLocalArchivedNoteTombstones,
  saveLocalNoteTombstones,
  saveLocalWorkspaces,
} from '../sync/localDB';
import { archivedRowIdForText } from '../sync/workspaceStorageBridge';

async function ensureWorkspaceRow({ storageKey, name, kind }) {
  if (!syncEnabled) return;
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

/**
 * Cold start always uses Home (workspace_home), never lastActiveStorageKey.
 * Avoids reopening on a hidden workspace; users still reach other workspaces via navigation in-session.
 */
function computeSyncPlaceholderState() {
  const app = loadAppState();
  const initialKey = 'workspace_home';
  let initialData = loadWorkspace(initialKey);
  if (isWorkspaceDataEmpty(initialData)) {
    initialData = getDefaultWorkspaceData();
    saveWorkspace(initialKey, initialData);
  }
  return {
    visibleWorkspaces: app.visibleWorkspaces,
    activeStorageKey: initialKey,
    data: initialData,
    currentWorkspace: 'home',
  };
}

export function WorkspaceProvider({ children }) {
  const initialWorkspaceState = useMemo(() => computeSyncPlaceholderState(), []);

  const [activeStorageKey, setActiveStorageKey] = useState(
    () => initialWorkspaceState.activeStorageKey,
  );
  const [visibleWorkspaces, setVisibleWorkspaces] = useState(
    () => initialWorkspaceState.visibleWorkspaces,
  );
  const [data, setData] = useState(() => initialWorkspaceState.data);
  const [currentWorkspace, setCurrentWorkspace] = useState(
    () => initialWorkspaceState.currentWorkspace,
  );
  const [workspaceSwitchGeneration, setWorkspaceSwitchGeneration] = useState(0);
  /** When sync is off, true immediately. When sync is on, false until fullSync notifies. */
  const [hydrationComplete, setHydrationComplete] = useState(() => !syncEnabled);
  const workspaceKey = activeStorageKey;

  const bumpWorkspaceSwitch = useCallback(() => {
    setWorkspaceSwitchGeneration((g) => g + 1);
  }, []);

  /** null = idle; drives App shell classes during workspace switches */
  const [workspaceTransitionMode, setWorkspaceTransitionMode] = useState(null);
  const [workspaceContentTransitioning, setWorkspaceContentTransitioning] =
    useState(false);
  const [workspaceTransitionEaseClass, setWorkspaceTransitionEaseClass] =
    useState('duration-200');
  const workspaceTransitionTimersRef = useRef([]);

  useEffect(() => {
    return () => {
      workspaceTransitionTimersRef.current.forEach(clearTimeout);
      workspaceTransitionTimersRef.current = [];
    };
  }, []);

  const cancelPendingWorkspaceContentTransition = useCallback(() => {
    workspaceTransitionTimersRef.current.forEach(clearTimeout);
    workspaceTransitionTimersRef.current = [];
    setWorkspaceContentTransitioning(false);
    setWorkspaceTransitionMode(null);
  }, []);

  const queueWorkspaceContentTransition = useCallback((mode, applyFn, meta) => {
    if (mode !== 'visible' && mode !== 'hidden') {
      applyFn();
      return;
    }
    workspaceTransitionTimersRef.current.forEach(clearTimeout);
    workspaceTransitionTimersRef.current = [];
    setWorkspaceTransitionEaseClass(mode === 'hidden' ? 'duration-100' : 'duration-200');
    setWorkspaceTransitionMode(mode);
    setWorkspaceContentTransitioning(true);
    const delay = mode === 'visible' ? 150 : 80;
    const t = window.setTimeout(() => {
      workspaceTransitionTimersRef.current = workspaceTransitionTimersRef.current.filter(
        (id) => id !== t,
      );
      if (meta?.isCancelled?.()) {
        setWorkspaceContentTransitioning(false);
        setWorkspaceTransitionMode(null);
        return;
      }
      applyFn();
      requestAnimationFrame(() => {
        setWorkspaceContentTransitioning(false);
        setWorkspaceTransitionMode(null);
      });
    }, delay);
    workspaceTransitionTimersRef.current.push(t);
  }, []);

  const save = useCallback(() => {
    saveWorkspace(activeStorageKey, data);
  }, [activeStorageKey, data]);

  useEffect(() => {
    save();
  }, [data, activeStorageKey, save]);

  useEffect(() => {
    if (!syncEnabled) return undefined;
    return subscribeHydrationComplete(() => {
      queueMicrotask(() => {
        setHydrationComplete(true);
      });
    });
  }, []);

  useEffect(() => {
    if (!syncEnabled) return;
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
    if (!syncEnabled) return undefined;
    const onSync = () => {
      const app = loadAppState();
      setVisibleWorkspaces(app.visibleWorkspaces);
      setData(loadWorkspace(activeStorageKey));
    };
    window.addEventListener('plainsight:full-sync', onSync);
    return () => window.removeEventListener('plainsight:full-sync', onSync);
  }, [activeStorageKey]);

  const applyNavigateByWorkspaceName = useCallback(
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

  /**
   * @param {string} name
   * @param {'visible' | 'hidden' | null} [uiTransition] Null = immediate (hydration, manage, etc.)
   * @param {{ isCancelled?: () => boolean }} [transitionMeta] When isCancelled() is true, skip apply (route effect superseded)
   */
  const load = useCallback(
    (name, uiTransition = null, transitionMeta) => {
      if (uiTransition === 'visible' || uiTransition === 'hidden') {
        queueWorkspaceContentTransition(
          uiTransition,
          () => applyNavigateByWorkspaceName(name),
          transitionMeta,
        );
      } else {
        applyNavigateByWorkspaceName(name);
      }
    },
    [applyNavigateByWorkspaceName, queueWorkspaceContentTransition],
  );

  /** Dot-commands: quick opacity dip */
  const switchWorkspace = useCallback(
    (name) => {
      queueWorkspaceContentTransition('hidden', () => applyNavigateByWorkspaceName(name));
    },
    [applyNavigateByWorkspaceName, queueWorkspaceContentTransition],
  );

  const applySwitchVisibleWorkspace = useCallback(
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

  /** Menu-visible workspace tap: fade + lift */
  const switchVisibleWorkspace = useCallback(
    (entry) => {
      queueWorkspaceContentTransition('visible', () =>
        applySwitchVisibleWorkspace(entry),
      );
    },
    [applySwitchVisibleWorkspace, queueWorkspaceContentTransition],
  );

  const createVisibleWorkspace = useCallback(
    (displayName) => {
      const name = displayName.trim();
      if (!name) return null;
      queueWorkspaceContentTransition('visible', () => {
        const id = uuidv4();
        const key = `${VISIBLE_WS_PREFIX}${id}`;
        setWorkspaceIdMapping(key, id);
        const fresh = getDefaultWorkspaceData();
        saveWorkspace(key, fresh);
        const entry = { id, name, key };
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
      });
      return null;
    },
    [bumpWorkspaceSwitch, queueWorkspaceContentTransition],
  );

  const renameVisibleWorkspace = useCallback((entry, newDisplayName) => {
    const name = (newDisplayName || '').trim();
    if (!name) return;
    const prev = loadAppState();
    const next = (prev.visibleWorkspaces || []).map((e) =>
      e.key === entry.key ? { ...e, name } : e,
    );
    saveAppStatePartial({ visibleWorkspaces: next });
    setVisibleWorkspaces(next);
    void ensureWorkspaceRow({
      storageKey: entry.key,
      name,
      kind: 'visible',
    });
    queueFullSync();
  }, []);

  const deleteVisibleWorkspace = useCallback(
    async (entry) => {
      if (entry.id === 'home') return false;
      const workspaceId =
        getWorkspaceIdForStorageKey(entry.key) || entry.id;
      if (!workspaceId) return false;

      const remoteDel = await deleteWorkspaceRemote(workspaceId);
      if (!remoteDel.ok) {
        console.error('[deleteVisibleWorkspace]', remoteDel.error);
        return false;
      }

      try {
        const localWs = await getLocalWorkspaces();
        await saveLocalWorkspaces(
          localWs.filter((w) => w.id !== workspaceId),
        );
      } catch {
        /* ignore */
      }

      removeWorkspaceIdMapping(entry.key, workspaceId);

      const wasActive = activeStorageKey === entry.key;
      const prev = loadAppState();
      const next = (prev.visibleWorkspaces || []).filter((e) => e.key !== entry.key);
      saveAppStatePartial({
        visibleWorkspaces: next,
        lastActiveStorageKey: wasActive
          ? 'workspace_home'
          : prev.lastActiveStorageKey,
      });
      setVisibleWorkspaces(next);
      deleteWorkspace(entry.key);
      if (wasActive) {
        let homeData = loadWorkspace('workspace_home');
        if (isWorkspaceDataEmpty(homeData)) {
          homeData = getDefaultWorkspaceData();
          saveWorkspace('workspace_home', homeData);
        }
        setActiveStorageKey('workspace_home');
        setData(homeData);
        setCurrentWorkspace('home');
        bumpWorkspaceSwitch();
      }
      queueFullSync();
      return true;
    },
    [activeStorageKey, bumpWorkspaceSwitch],
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
    // Record a tombstone so sync can delete the Supabase row.
    try {
      const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
      const deletedAt = new Date().toISOString();
      const id = archivedRowIdForText(workspaceId, textKey);
      void (async () => {
        const existing = await getLocalArchivedNoteTombstones(workspaceId);
        const next = [
          { id, workspace_id: workspaceId, deleted_at: deletedAt },
          ...existing.filter((t) => t.id !== id),
        ];
        await saveLocalArchivedNoteTombstones(workspaceId, next);
      })();
    } catch {
      /* ignore */
    }
    queueFullSync();
  }, [activeStorageKey]);

  const removeArchivedByTextKeys = useCallback((textKeys) => {
    if (!textKeys?.length) return;
    setData((prev) => {
      const arch = { ...(prev.archivedNotes || {}) };
      for (const k of textKeys) {
        delete arch[k];
      }
      return { ...prev, archivedNotes: arch };
    });
    // Record tombstones so sync can delete the Supabase rows.
    try {
      const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
      const deletedAt = new Date().toISOString();
      const ids = textKeys.map((t) => archivedRowIdForText(workspaceId, t));
      void (async () => {
        const existing = await getLocalArchivedNoteTombstones(workspaceId);
        const next = [
          ...ids.map((id) => ({ id, workspace_id: workspaceId, deleted_at: deletedAt })),
          ...existing.filter((t) => !ids.includes(t.id)),
        ];
        await saveLocalArchivedNoteTombstones(workspaceId, next);
      })();
    } catch {
      /* ignore */
    }
    queueFullSync();
  }, [activeStorageKey]);

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
    hydrationComplete,
    data,
    visibleWorkspaces,
    workspaceSwitchGeneration,
    workspaceTransitionMode,
    workspaceContentTransitioning,
    workspaceTransitionEaseClass,
    cancelPendingWorkspaceContentTransition,
    load,
    save,
    switchWorkspace,
    switchVisibleWorkspace,
    createVisibleWorkspace,
    renameVisibleWorkspace,
    deleteVisibleWorkspace,
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
