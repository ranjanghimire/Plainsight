import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
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
  getMergedWorkspaceNameByIdSync,
  getOrCreateWorkspaceIdForStorageKey,
  getStorageKeyForWorkspaceId,
  getWorkspaceDisplayLabelFromStorageKey,
  getWorkspaceIdForStorageKey,
  hiddenWorkspaceSlugFromName,
  removeWorkspaceIdMapping,
  resolveWorkspaceIdForStorageKey,
  setWorkspaceIdMapping,
  slugFromLegacyHiddenStorageKey,
  countHiddenWorkspaceKeys,
} from '../utils/storage';
import {
  MAX_ARCHIVED_ITEMS_PER_WORKSPACE,
  MAX_FREE_HIDDEN_WORKSPACES,
  MAX_FREE_VISIBLE_WORKSPACES,
} from '../constants/workspaceLimits';
import { pruneArchivedNotesUi } from '../utils/archivedPrune';
import { queueFullSync, runInitialHydration } from '../sync/syncHelpers';
import { whenRealtimeAuthReady } from '../sync/supabaseClient';
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
  subscribeToArchivedNotes,
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
  getLocalCategories,
  getLocalCategoryTombstones,
  getLocalNoteTombstones,
  getLocalWorkspacePins,
  getLocalWorkspaces,
  saveLocalArchivedNoteTombstones,
  saveLocalCategoryTombstones,
  saveLocalNoteTombstones,
  saveLocalWorkspacePins,
  saveLocalWorkspaces,
} from '../sync/localDB';
import { archivedRowIdForText } from '../sync/workspaceStorageBridge';
import {
  acceptWorkspaceShare,
  buildSharedWorkspaceRows,
  fetchWorkspaceActivityLogs,
  listWorkspaceShares,
  logWorkspaceActivity,
  makeWorkspacePrivate,
  shareWorkspaceByEmail,
  subscribeToWorkspaceShares,
} from '../sync/sharedWorkspaces';

/**
 * Resolve workspace UUID for menu-visible entries:
 * - Home: workspace_home mapping
 * - Personal visible tabs: `entry.id`
 * - Shared menu rows: `entry.workspaceId`
 */
function extractWorkspaceIdFromVisibleEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.workspaceId) return String(entry.workspaceId);
  if (entry.id && entry.id !== 'home') return String(entry.id);
  if (entry.key) return getWorkspaceIdForStorageKey(String(entry.key)) || null;
  return null;
}

function normalizeVisibilityWorkspaceName(raw) {
  const name = String(raw || '').trim();
  if (!name) return 'Workspace';
  return name;
}

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
      owner_id: prev.owner_id || row.owner_id,
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
      showToast('Free plan allows one hidden workspace. Upgrade to cloud sync for more.', {
        persistent: true,
        showUpgradeCta: true,
      });
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
          { persistent: true, showUpgradeCta: true },
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
  /** Raw share rows visible to current user (owner/recipient). */
  const [sharedWorkspaceShares, setSharedWorkspaceShares] = useState([]);
  /** Accepted shared workspaces shown in the menu section. */
  const [sharedWorkspaceRows, setSharedWorkspaceRows] = useState([]);
  /** Pending incoming invites for the signed-in user. */
  const [pendingSharedInvites, setPendingSharedInvites] = useState([]);
  /** Local / entitled-only: true. When canUseSupabase, false until fullSync notifies. */
  const [canUseSupabase, setCanUseSupabase] = useState(() => getCanUseSupabase());
  const [hydrationComplete, setHydrationComplete] = useState(() => !getCanUseSupabase());
  const [syncHydrationConnectivityWarning, setSyncHydrationConnectivityWarning] =
    useState(false);
  /** Bumped on each successful full sync so Postgres realtime channels re-bind to the current workspace id set (e.g. after accepting a shared workspace). */
  const [supabaseRealtimeBindingEpoch, setSupabaseRealtimeBindingEpoch] = useState(0);
  const hydrationRetryTimerRef = useRef(null);
  const hydrationWarningRef = useRef(false);
  const workspaceKey = activeStorageKey;

  useEffect(() => {
    hydrationWarningRef.current = syncHydrationConnectivityWarning;
  }, [syncHydrationConnectivityWarning]);

  const refreshSharedWorkspaceState = useCallback(async () => {
    if (!getCanUseSupabase()) {
      setSharedWorkspaceShares([]);
      setSharedWorkspaceRows([]);
      setPendingSharedInvites([]);
      return { ok: true };
    }
    const sharesRes = await listWorkspaceShares();
    if (sharesRes.error) {
      return { ok: false, error: sharesRes.error };
    }
    const localRows = Array.isArray(sharesRes.data) ? sharesRes.data : [];
    const nameById = new Map();
    for (const v of visibleWorkspaces || []) {
      const wid = getWorkspaceIdForStorageKey(v.key);
      if (wid) nameById.set(wid, v.name);
    }
    try {
      const mergedWs = await getLocalWorkspaces();
      for (const w of mergedWs) {
        if (!w?.id) continue;
        const wid = String(w.id);
        const nm = typeof w.name === 'string' ? w.name.trim() : '';
        if (!nm) continue;
        const prev = nameById.get(wid);
        const prevGeneric =
          !prev ||
          /^workspace$/i.test(String(prev).trim()) ||
          String(prev).trim() === 'Workspace';
        if (!prev || prevGeneric) nameById.set(wid, nm);
      }
    } catch {
      /* ignore */
    }
    const built = buildSharedWorkspaceRows({
      shares: localRows,
      workspaceNamesById: nameById,
    });
    setSharedWorkspaceShares(localRows);
    setSharedWorkspaceRows(built.acceptedRows);
    setPendingSharedInvites(built.pendingRows);
    return { ok: true };
  }, [visibleWorkspaces]);

  const getWorkspaceIdByVisibleEntry = useCallback(
    (entry) => extractWorkspaceIdFromVisibleEntry(entry),
    [],
  );

  const getWorkspaceNameById = useCallback(
    (workspaceId) => {
      if (!workspaceId) return 'Workspace';
      const fromVisible = (visibleWorkspaces || []).find(
        (e) => String(extractWorkspaceIdFromVisibleEntry(e) || '') === String(workspaceId),
      );
      if (fromVisible?.name) return normalizeVisibilityWorkspaceName(fromVisible.name);
      const fromShared = (sharedWorkspaceRows || []).find(
        (r) => String(r.workspaceId) === String(workspaceId),
      );
      if (fromShared?.workspaceName) {
        const sharedNm = String(fromShared.workspaceName).trim();
        if (
          sharedNm &&
          !sharedNm.startsWith(VISIBLE_WS_PREFIX) &&
          !/^workspace_/i.test(sharedNm)
        ) {
          return normalizeVisibilityWorkspaceName(sharedNm);
        }
      }
      const mergedNm = getMergedWorkspaceNameByIdSync(String(workspaceId));
      if (mergedNm) return normalizeVisibilityWorkspaceName(mergedNm);
      const storageKey = getStorageKeyForWorkspaceId(String(workspaceId));
      if (storageKey) {
        return normalizeVisibilityWorkspaceName(
          getWorkspaceDisplayLabelFromStorageKey(storageKey),
        );
      }
      return 'Workspace';
    },
    [sharedWorkspaceRows, visibleWorkspaces],
  );

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

  /** Persist before paint so a same-tick `queueFullSync` never reads stale workspace JSON from storage. */
  useLayoutEffect(() => {
    save();
  }, [data, activeStorageKey, save]);

  useEffect(() => {
    const onStorageMutated = () => {
      try {
        setData(loadWorkspace(activeStorageKey));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('plainsight:workspace-storage-mutated', onStorageMutated);
    return () =>
      window.removeEventListener('plainsight:workspace-storage-mutated', onStorageMutated);
  }, [activeStorageKey]);

  useEffect(() => {
    if (!canUseSupabase) {
      if (hydrationRetryTimerRef.current != null) {
        window.clearTimeout(hydrationRetryTimerRef.current);
        hydrationRetryTimerRef.current = null;
      }
      queueMicrotask(() => {
        setHydrationComplete(true);
        setSyncHydrationConnectivityWarning(false);
      });
      return undefined;
    }
    queueMicrotask(() => setHydrationComplete(false));
    const unsub = subscribeHydrationComplete((payload) => {
      queueMicrotask(() => {
        setHydrationComplete(true);
        if (payload.ok) {
          setSyncHydrationConnectivityWarning(false);
          return;
        }
        if (!getCanUseSupabase()) return;
        setSyncHydrationConnectivityWarning(true);
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

  /** PWA / mobile: retry hydration when returning to the app if the last full sync failed (amber dot). */
  useEffect(() => {
    if (!canUseSupabase) return undefined;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!hydrationWarningRef.current) return;
      void runInitialHydration();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [canUseSupabase]);

  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return undefined;

    let debounceTimer = null;
    const scheduleFullSync = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void queueFullSync();
      }, 400);
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

    void (async () => {
      try {
        await whenRealtimeAuthReady();
        if (cancelled) return;
        addUnsub(subscribeToWorkspaces(() => scheduleFullSync()));
        addUnsub(subscribeToWorkspacePins(() => scheduleFullSync()));
        const workspaces = await getLocalWorkspaces();
        if (cancelled) return;
        for (const w of workspaces) {
          if (!w?.id) continue;
          addUnsub(subscribeToNotes(w.id, () => scheduleFullSync()));
          addUnsub(subscribeToCategories(w.id, () => scheduleFullSync()));
          addUnsub(subscribeToArchivedNotes(w.id, () => scheduleFullSync()));
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
  }, [canUseSupabase, hydrationComplete, supabaseRealtimeBindingEpoch]);

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
      void refreshSharedWorkspaceState();
      setSupabaseRealtimeBindingEpoch((n) => n + 1);
    };
    window.addEventListener('plainsight:full-sync', onSync);
    return () => window.removeEventListener('plainsight:full-sync', onSync);
  }, [canUseSupabase, activeStorageKey, refreshSharedWorkspaceState]);

  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) {
      if (!canUseSupabase) {
        setSharedWorkspaceShares([]);
        setSharedWorkspaceRows([]);
        setPendingSharedInvites([]);
      }
      return undefined;
    }
    void refreshSharedWorkspaceState();
    return undefined;
  }, [canUseSupabase, hydrationComplete, refreshSharedWorkspaceState]);

  /** Postgres Realtime on workspace_shares: pending invites + accept state without full page refresh. */
  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return undefined;
    let debounceTimer = null;
    const onRemoteShareChange = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void refreshSharedWorkspaceState();
        queueFullSync();
      }, 400);
    };
    let cancelled = false;
    let unsub = () => {};
    void (async () => {
      try {
        await whenRealtimeAuthReady();
        if (cancelled) return;
        unsub = subscribeToWorkspaceShares(onRemoteShareChange);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      unsub();
    };
  }, [canUseSupabase, hydrationComplete, refreshSharedWorkspaceState]);

  /**
   * When Realtime does not wake a full sync (e.g. private broadcast auth cannot see
   * `x-plainsight-session` on the WebSocket — only on REST), periodic + focus/visibility pulls
   * keep shared workspaces from going stale without a full reload.
   *
   * Keep this modest once workspace broadcasts authorize correctly (each pull is a fullSync).
   */
  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return undefined;
    const pullIfVisible = () => {
      if (document.visibilityState === 'visible') void queueFullSync();
    };
    const intervalId = window.setInterval(pullIfVisible, 4_000);
    let debounce = null;
    const schedulePull = () => {
      if (document.visibilityState !== 'visible') return;
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        void queueFullSync();
      }, 450);
    };
    document.addEventListener('visibilitychange', schedulePull);
    window.addEventListener('focus', schedulePull);
    return () => {
      window.clearInterval(intervalId);
      if (debounce != null) window.clearTimeout(debounce);
      document.removeEventListener('visibilitychange', schedulePull);
      window.removeEventListener('focus', schedulePull);
    };
  }, [canUseSupabase, hydrationComplete]);

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

  const openSharedWorkspace = useCallback(
    (workspaceId) => {
      const wid = String(workspaceId || '').trim();
      if (!wid) return false;
      const key = getStorageKeyForWorkspaceId(wid) || `${VISIBLE_WS_PREFIX}${wid}`;
      let nextData = loadWorkspace(key);
      if (isWorkspaceDataEmpty(nextData)) {
        nextData = getDefaultWorkspaceData();
        saveWorkspace(key, nextData);
      }
      const name = getWorkspaceNameById(wid);
      void ensureWorkspaceRow({
        storageKey: key,
        name,
        kind: 'visible',
      });
      setActiveStorageKey(key);
      setData(nextData);
      setCurrentWorkspace(`visible:${wid}`);
      // Do not append to visibleWorkspaces: collaborators only list shared tabs under “Shared Workspaces”.
      saveAppStatePartial({ lastActiveStorageKey: key });
      bumpWorkspaceSwitch();
      void queueFullSync();
      return true;
    },
    [bumpWorkspaceSwitch, getWorkspaceNameById],
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

  const shareVisibleWorkspace = useCallback(
    async (entry, recipientEmail) => {
      const workspaceId = getWorkspaceIdByVisibleEntry(entry);
      if (!workspaceId) {
        return { ok: false, error: { message: 'Workspace id is missing' } };
      }
      const workspaceName = normalizeVisibilityWorkspaceName(entry?.name || 'Workspace');
      const res = await shareWorkspaceByEmail(workspaceId, workspaceName, recipientEmail);
      if (!res.ok) return res;
      await logWorkspaceActivity(
        workspaceId,
        'workspace_shared',
        `Shared with ${String(recipientEmail || '').trim().toLowerCase()}`,
        { recipient_email: String(recipientEmail || '').trim().toLowerCase() },
      );
      await refreshSharedWorkspaceState();
      void queueFullSync();
      return { ok: true };
    },
    [getWorkspaceIdByVisibleEntry, refreshSharedWorkspaceState],
  );

  const acceptSharedWorkspaceInvite = useCallback(
    async (shareId) => {
      const res = await acceptWorkspaceShare(shareId);
      if (!res.ok) return res;
      await refreshSharedWorkspaceState();
      void queueFullSync();
      return { ok: true };
    },
    [refreshSharedWorkspaceState],
  );

  const makeWorkspacePrivateById = useCallback(
    async (workspaceId) => {
      if (!workspaceId) return { ok: false, revokedCount: 0 };
      const res = await makeWorkspacePrivate(workspaceId);
      if (!res.ok) return res;
      await refreshSharedWorkspaceState();
      void queueFullSync();
      return res;
    },
    [refreshSharedWorkspaceState],
  );

  const fetchWorkspaceActivityLog = useCallback(async (workspaceId, limit = 80) => {
    if (!workspaceId) return { data: [] };
    return fetchWorkspaceActivityLogs(workspaceId, limit);
  }, []);

  const logWorkspaceEditActivity = useCallback(
    async (action, summary, details = {}) => {
      const workspaceId = getWorkspaceIdForStorageKey(activeStorageKey);
      if (!workspaceId) return { ok: false, error: { message: 'Workspace id missing' } };
      return logWorkspaceActivity(workspaceId, action, summary, details);
    },
    [activeStorageKey],
  );

  const addNote = useCallback((text, category = null, opts = {}) => {
    const now = new Date().toISOString();
    const id = uuidv4();
    const row = { id, text, category, createdAt: now, updatedAt: now };
    if (opts.boldFirstLine) row.boldFirstLine = true;
    setData((prev) => ({
      ...prev,
      notes: [row, ...(prev.notes || [])],
    }));
    queueFullSync();
    void logWorkspaceEditActivity('note_added', 'Added note', {
      note_id: id,
      category: category ?? null,
    });
    return id;
  }, [logWorkspaceEditActivity]);

  const updateNote = useCallback((id, updates) => {
    const now = new Date().toISOString();
    setData((prev) => ({
      ...prev,
      notes: (prev.notes || []).map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: now } : n,
      ),
    }));
    queueFullSync();
    void logWorkspaceEditActivity('note_updated', 'Updated note', {
      note_id: id,
      fields: Object.keys(updates || {}),
    });
  }, [logWorkspaceEditActivity]);

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
      const pruned = pruneArchivedNotesUi(arch, MAX_ARCHIVED_ITEMS_PER_WORKSPACE);
      const archOut = pruned.map;
      if (pruned.removedTextKeys.length > 0) {
        queueMicrotask(() => {
          try {
            const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
            const deletedAt = new Date().toISOString();
            const ids = pruned.removedTextKeys.map((t) =>
              archivedRowIdForText(workspaceId, t),
            );
            void (async () => {
              const existing = await getLocalArchivedNoteTombstones(workspaceId);
              const next = [
                ...ids.map((tid) => ({
                  id: tid,
                  workspace_id: workspaceId,
                  deleted_at: deletedAt,
                })),
                ...existing.filter((t) => !ids.includes(t.id)),
              ];
              await saveLocalArchivedNoteTombstones(workspaceId, next);
            })();
          } catch {
            /* ignore */
          }
        });
      }
      return {
        ...prev,
        notes: (prev.notes || []).filter((x) => x.id !== id),
        archivedNotes: archOut,
      };
    });
    void (async () => {
      try {
        const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
        const deletedAt = new Date().toISOString();
        const existing = await getLocalNoteTombstones(workspaceId);
        const next = [
          { id, workspace_id: workspaceId, deleted_at: deletedAt },
          ...existing.filter((t) => t.id !== id),
        ];
        await saveLocalNoteTombstones(workspaceId, next);
      } catch {
        /* ignore */
      } finally {
        queueFullSync();
      }
      void logWorkspaceEditActivity('note_deleted', 'Deleted note to archive', {
        note_id: id,
      });
    })();
  }, [activeStorageKey, logWorkspaceEditActivity]);

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
    void logWorkspaceEditActivity('note_restored', 'Restored archived note', {
      text: textKey,
      category: resolvedCategory ?? null,
    });
  }, [logWorkspaceEditActivity]);

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
    void logWorkspaceEditActivity('archived_note_updated', 'Updated archived note', {
      text: textKey,
      fields: Object.keys(updates || {}),
    });
  }, [logWorkspaceEditActivity]);

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
    void logWorkspaceEditActivity(
      'archived_note_deleted_permanently',
      'Permanently deleted archived note',
      { text: textKey },
    );
  }, [activeStorageKey, logWorkspaceEditActivity]);

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
    void logWorkspaceEditActivity('archived_notes_bulk_deleted', 'Cleared archived notes', {
      count: textKeys.length,
    });
  }, [activeStorageKey, logWorkspaceEditActivity]);

  const addCategory = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setData((prev) => {
      const cats = prev.categories || [];
      if (cats.includes(trimmed)) return prev;
      return { ...prev, categories: [...cats, trimmed] };
    });
    void logWorkspaceEditActivity('category_added', 'Added category', { name: trimmed });
  }, [logWorkspaceEditActivity]);

  const deleteCategory = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    void (async () => {
      try {
        const workspaceId = getOrCreateWorkspaceIdForStorageKey(activeStorageKey);
        const cats = await getLocalCategories(workspaceId);
        const row = cats.find((c) => c.name === trimmed);
        if (row?.id) {
          const deletedAt = new Date().toISOString();
          const existing = await getLocalCategoryTombstones(workspaceId);
          const next = [
            ...existing.filter((t) => t.id !== row.id),
            { id: row.id, workspace_id: workspaceId, deleted_at: deletedAt },
          ];
          await saveLocalCategoryTombstones(workspaceId, next);
        }
      } catch {
        /* ignore */
      }
    })().then(() => {
      setData((prev) => {
        const arch = { ...(prev.archivedNotes || {}) };
        for (const [k, v] of Object.entries(arch)) {
          if (v.category === trimmed) {
            arch[k] = { ...v, category: undefined };
          }
        }
        return {
          ...prev,
          categories: (prev.categories || []).filter((c) => c !== trimmed),
          notes: (prev.notes || []).map((n) =>
            n.category === trimmed ? { ...n, category: null } : n,
          ),
          archivedNotes: arch,
        };
      });
      void logWorkspaceEditActivity('category_deleted', 'Deleted category', { name: trimmed });
    });
  }, [activeStorageKey, logWorkspaceEditActivity]);

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
    void logWorkspaceEditActivity('category_renamed', 'Renamed category', {
      from: oldName,
      to: trimmed,
    });
  }, [logWorkspaceEditActivity]);

  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return;
    const onSession = () => {
      void refreshSharedWorkspaceState();
    };
    window.addEventListener('plainsight:local-session', onSession);
    return () => window.removeEventListener('plainsight:local-session', onSession);
  }, [canUseSupabase, hydrationComplete, refreshSharedWorkspaceState]);

  useEffect(() => {
    if (!canUseSupabase || !hydrationComplete) return;
    void refreshSharedWorkspaceState();
  }, [
    canUseSupabase,
    hydrationComplete,
    refreshSharedWorkspaceState,
    visibleWorkspaces,
    workspaceSwitchGeneration,
  ]);

  const value = {
    currentWorkspace,
    workspaceKey,
    activeStorageKey,
    hydrationComplete,
    syncHydrationConnectivityWarning,
    data,
    visibleWorkspaces,
    sharedWorkspaceShares,
    sharedWorkspaces: sharedWorkspaceRows,
    pendingSharedInvites,
    pendingSharedWorkspaceInvites: pendingSharedInvites,
    workspaceSwitchGeneration,
    workspaceTransitionMode,
    workspaceContentTransitioning,
    workspaceTransitionEaseClass,
    cancelPendingWorkspaceContentTransition,
    load,
    save,
    switchWorkspace,
    switchVisibleWorkspace,
    openSharedWorkspace,
    createVisibleWorkspace,
    renameVisibleWorkspace,
    getWorkspaceIdByVisibleEntry,
    shareVisibleWorkspace,
    acceptSharedWorkspaceInvite,
    makeWorkspacePrivateById,
    fetchWorkspaceActivityLog,
    logWorkspaceEditActivity,
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
    getWorkspaceNameById,
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
