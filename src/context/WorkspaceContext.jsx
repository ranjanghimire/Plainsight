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
  getAllWorkspaceKeys,
  getOrCreateWorkspaceIdForStorageKey,
  getStorageKeyForWorkspaceId,
  getWorkspaceIdForStorageKey,
  hiddenWorkspaceSlugFromName,
  removeWorkspaceIdMapping,
  resolveWorkspaceIdForStorageKey,
  setWorkspaceIdMapping,
  slugFromLegacyHiddenStorageKey,
  countHiddenWorkspaceKeys,
} from '../utils/storage';
import {
  MAX_FREE_HIDDEN_WORKSPACES,
  MAX_FREE_VISIBLE_WORKSPACES,
} from '../constants/workspaceLimits';
import { queueFullSync, runInitialHydration } from '../sync/syncHelpers';
import {
  getCanUseSupabase,
  getSyncEntitled,
  subscribeSyncGating,
} from '../sync/syncEnabled';
import { useSyncEntitlement } from './SyncEntitlementContext';
import {
  deleteWorkspaceRemote,
  subscribeToNotes,
  subscribeToCategories,
  subscribeToWorkspaces,
  subscribeToWorkspacePins,
} from '../sync/syncEngine';
import { subscribeHydrationComplete } from '../sync/hydrationBridge';
import {
  getSession as getLocalSession,
  LOCAL_DEV_USER_ID,
} from '../auth/localSession';
import {
  clearLocalWorkspaceData,
  getLocalArchivedNoteTombstones,
  getLocalNoteTombstones,
  getLocalWorkspacePins,
  getLocalWorkspaces,
  saveLocalArchivedNoteTombstones,
  saveLocalNoteTombstones,
  saveLocalWorkspacePins,
  saveLocalWorkspaces,
} from '../sync/localDB';
import { archivedRowIdForText } from '../sync/workspaceStorageBridge';

async function ensureWorkspaceRow({ storageKey, name, kind }) {
  const now = new Date().toISOString();
  const id = getOrCreateWorkspaceIdForStorageKey(storageKey);
  const userId = getLocalSession().userId || LOCAL_DEV_USER_ID;

  const row = {
    id,
    owner_id: userId,
    name,
    kind,
    created_at: now,
    updated_at: now,
  };

  const existing = await getLocalWorkspaces();
  const idx = existing.findIndex((w) => w.id === id);
  const next = [...existing];
  if (idx >= 0) {
    const prev = next[idx];
    next[idx] = {
      ...prev,
      ...row,
      owner_id: userId,
      created_at: prev.created_at || row.created_at,
    };
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
  const { showToast } = useSyncEntitlement();
  const initialWorkspaceState = useMemo(() => computeSyncPlaceholderState(), []);

  const peekHiddenWorkspaceCreationAllowed = useCallback((name) => {
    if (getSyncEntitled()) return true;
    const slug = (name || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (!slug || slug === 'home') return true;
    const key = getWorkspaceKey(name);
    try {
      if (localStorage.getItem(key) !== null) return true;
    } catch {
      return true;
    }
    return countHiddenWorkspaceKeys() < MAX_FREE_HIDDEN_WORKSPACES;
  }, []);

  const canOpenOrCreateHiddenWorkspace = useCallback(
    (name) => {
      if (peekHiddenWorkspaceCreationAllowed(name)) return true;
      showToast(
        'Free plan allows one hidden workspace. Upgrade to cloud sync for more.',
      );
      return false;
    },
    [peekHiddenWorkspaceCreationAllowed, showToast],
  );

  const canAddVisibleWorkspace = useCallback(
    (currentVisibleCount) => {
      if (getSyncEntitled()) return true;
      if (currentVisibleCount >= MAX_FREE_VISIBLE_WORKSPACES) {
        showToast(
          `Free plan allows ${MAX_FREE_VISIBLE_WORKSPACES} visible workspaces (including Home). Upgrade to cloud sync for more.`,
        );
        return false;
      }
      return true;
    },
    [showToast],
  );

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
  /** Local / entitled-only: true. When canUseSupabase, false until fullSync notifies. */
  const [canUseSupabase, setCanUseSupabase] = useState(() => getCanUseSupabase());
  const [hydrationComplete, setHydrationComplete] = useState(() => !getCanUseSupabase());
  const [hydrationSyncToast, setHydrationSyncToast] = useState(false);
  const hydrationRetryTimerRef = useRef(null);
  const workspaceKey = activeStorageKey;

  useEffect(
    () => subscribeSyncGating(() => setCanUseSupabase(getCanUseSupabase())),
    [],
  );

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
    if (!canUseSupabase) {
      if (hydrationRetryTimerRef.current != null) {
        window.clearTimeout(hydrationRetryTimerRef.current);
        hydrationRetryTimerRef.current = null;
      }
      queueMicrotask(() => {
        setHydrationComplete(true);
        setHydrationSyncToast(false);
      });
      return undefined;
    }
    queueMicrotask(() => setHydrationComplete(false));
    const unsub = subscribeHydrationComplete((payload) => {
      queueMicrotask(() => {
        setHydrationComplete(true);
        if (payload.ok) {
          setHydrationSyncToast(false);
          return;
        }
        if (!getCanUseSupabase()) return;
        setHydrationSyncToast(true);
        if (hydrationRetryTimerRef.current != null) {
          window.clearTimeout(hydrationRetryTimerRef.current);
        }
        hydrationRetryTimerRef.current = window.setTimeout(() => {
          hydrationRetryTimerRef.current = null;
          if (getCanUseSupabase()) void runInitialHydration();
        }, 4000);
      });
    });
    void runInitialHydration();
    return () => {
      unsub();
      if (hydrationRetryTimerRef.current != null) {
        window.clearTimeout(hydrationRetryTimerRef.current);
        hydrationRetryTimerRef.current = null;
      }
    };
  }, [canUseSupabase]);

  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return undefined;

    let debounceTimer = null;
    const scheduleFullSync = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void queueFullSync();
      }, 900);
    };

    const unsubs = [];
    let cancelled = false;
    const addUnsub = (fn) => {
      if (cancelled) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      } else {
        unsubs.push(fn);
      }
    };

    addUnsub(subscribeToWorkspaces(() => scheduleFullSync()));
    addUnsub(subscribeToWorkspacePins(() => scheduleFullSync()));

    (async () => {
      try {
        const workspaces = await getLocalWorkspaces();
        if (cancelled) return;
        for (const w of workspaces) {
          if (!w?.id) continue;
          addUnsub(subscribeToNotes(w.id, () => scheduleFullSync()));
          addUnsub(subscribeToCategories(w.id, () => scheduleFullSync()));
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    };
  }, [canUseSupabase, hydrationComplete]);

  useEffect(() => {
    // With cloud sync: avoid writing workspace rows before hydration (duplicate Home rows on push).
    // Local-only: always persist so /manage and quotas see hidden workspaces.
    if (canUseSupabase && !hydrationComplete) return;
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
  }, [canUseSupabase, hydrationComplete, activeStorageKey, visibleWorkspaces]);

  useEffect(() => {
    if (!canUseSupabase) return undefined;
    const onSync = () => {
      const app = loadAppState();
      setVisibleWorkspaces(app.visibleWorkspaces);
      setData(loadWorkspace(activeStorageKey));
    };
    window.addEventListener('plainsight:full-sync', onSync);
    return () => window.removeEventListener('plainsight:full-sync', onSync);
  }, [canUseSupabase, activeStorageKey]);

  const applyNavigateByWorkspaceName = useCallback(
    (name) => {
      if (!canOpenOrCreateHiddenWorkspace(name)) return;
      const key = getWorkspaceKey(name);
      let nextData = loadWorkspace(key);
      if (isWorkspaceDataEmpty(nextData)) {
        nextData = getDefaultWorkspaceData();
        saveWorkspace(key, nextData);
      }
      void ensureWorkspaceRow({
        storageKey: key,
        name: name === 'home' ? 'Home' : name,
        kind: name === 'home' ? 'visible' : 'hidden',
      });
      setActiveStorageKey(key);
      setData(nextData);
      setCurrentWorkspace(name === 'home' ? 'home' : getWorkspaceNameFromKey(key));
      saveAppStatePartial({ lastActiveStorageKey: key });
      bumpWorkspaceSwitch();
      queueFullSync();
    },
    [bumpWorkspaceSwitch, canOpenOrCreateHiddenWorkspace],
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
      }
      void ensureWorkspaceRow({
        storageKey: entry.key,
        name: entry.name,
        kind: 'visible',
      });
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
      if (!canAddVisibleWorkspace(visibleWorkspaces.length)) return null;
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
    [
      bumpWorkspaceSwitch,
      queueWorkspaceContentTransition,
      visibleWorkspaces.length,
      canAddVisibleWorkspace,
    ],
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
        await clearLocalWorkspaceData(workspaceId);
        const pins = await getLocalWorkspacePins();
        await saveLocalWorkspacePins(
          pins.filter((p) => p.workspace_id !== workspaceId),
        );
      } catch (e) {
        console.error('[deleteVisibleWorkspace] local cleanup', e);
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

  /** Legacy hidden workspaces (`workspace_*`): same remote + IndexedDB cleanup as visible deletes. */
  const deleteHiddenWorkspace = useCallback(
    async (storageKey) => {
      if (storageKey === 'workspace_home') return false;

      let localWs = [];
      try {
        localWs = await getLocalWorkspaces();
      } catch {
        /* ignore */
      }

      const slug = slugFromLegacyHiddenStorageKey(storageKey);
      const uniqueIds = [];
      const idSet = new Set();
      if (slug) {
        for (const w of localWs) {
          if (
            w?.id &&
            w.kind === 'hidden' &&
            hiddenWorkspaceSlugFromName(w.name) === slug
          ) {
            if (!idSet.has(w.id)) {
              idSet.add(w.id);
              uniqueIds.push(w.id);
            }
          }
        }
      }
      if (uniqueIds.length === 0) {
        const one =
          getWorkspaceIdForStorageKey(storageKey) ||
          resolveWorkspaceIdForStorageKey(storageKey, localWs);
        if (one) {
          idSet.add(one);
          uniqueIds.push(one);
        }
      }

      if (uniqueIds.length === 0) {
        removeWorkspaceIdMapping(storageKey, undefined);
        deleteWorkspace(storageKey);
        queueFullSync();
        return true;
      }

      if (getCanUseSupabase()) {
        for (const wid of uniqueIds) {
          // Require a real workspace row delete; allowZeroRows hid cases where the row stayed on
          // Supabase and the same name (e.g. "tree") reappeared after the next sync.
          const remoteDel = await deleteWorkspaceRemote(wid);
          if (!remoteDel.ok) {
            console.error('[deleteHiddenWorkspace]', remoteDel.error);
            return false;
          }
        }
      }

      try {
        await saveLocalWorkspaces(localWs.filter((w) => !uniqueIds.includes(w.id)));
        for (const wid of uniqueIds) {
          await clearLocalWorkspaceData(wid);
        }
        const pins = await getLocalWorkspacePins();
        await saveLocalWorkspacePins(
          pins.filter((p) => !uniqueIds.includes(p.workspace_id)),
        );
      } catch (e) {
        console.error('[deleteHiddenWorkspace] local cleanup', e);
      }

      const canonicalKeys = uniqueIds.map((wid) => ({
        wid,
        key: getStorageKeyForWorkspaceId(wid),
      }));
      const activeWid = getWorkspaceIdForStorageKey(activeStorageKey);
      const wasActive =
        activeStorageKey === storageKey ||
        (activeWid != null && uniqueIds.includes(activeWid));

      for (const k of getAllWorkspaceKeys()) {
        if (k === 'workspace_home') continue;
        const kid = getWorkspaceIdForStorageKey(k);
        if (kid && uniqueIds.includes(kid)) {
          deleteWorkspace(k);
        }
      }

      for (const wid of uniqueIds) {
        removeWorkspaceIdMapping(null, wid);
      }

      deleteWorkspace(storageKey);
      for (const { key: canonicalKey } of canonicalKeys) {
        if (canonicalKey && canonicalKey !== storageKey) {
          deleteWorkspace(canonicalKey);
        }
      }
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
    deleteHiddenWorkspace,
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
    canOpenOrCreateHiddenWorkspace,
    peekHiddenWorkspaceCreationAllowed,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {hydrationSyncToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[120] max-w-[min(90vw,22rem)] -translate-x-1/2 rounded-lg bg-stone-900/90 px-4 py-2 text-center text-sm text-stone-100 shadow-lg dark:bg-stone-100/95 dark:text-stone-900"
          role="status"
          aria-live="polite"
        >
          Could not sync. Retrying soon.
        </div>
      ) : null}
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
