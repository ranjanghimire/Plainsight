import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { supabase } from '../sync/supabaseClient';
import {
  setSupabaseSessionExists,
  getSupabaseSessionExists,
  subscribeSyncGating,
  setSyncRemoteActive,
  getSyncRemoteActive,
  getSyncEntitled,
} from '../sync/syncEnabled';
import { SignInSyncModal } from '../components/SignInSyncModal';
import { EnableCloudSyncModal } from '../components/EnableCloudSyncModal';

const TOAST_MS = 3200;
const CLOUD_SYNC_AUTO_PROMPT_KEY = 'plainsight_cloud_sync_auto_prompted';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [supabaseSessionExists, setSessionExistsUi] = useState(
    () => getSupabaseSessionExists(),
  );
  const [syncRemoteActive, setSyncRemoteActiveUi] = useState(() => getSyncRemoteActive());
  const [syncEntitled, setSyncEntitledUi] = useState(() => getSyncEntitled());
  const [signInSyncOpen, setSignInSyncOpen] = useState(false);
  const [enableCloudSyncOpen, setEnableCloudSyncOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [authEmail, setAuthEmail] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(
    () =>
      subscribeSyncGating(() => {
        setSessionExistsUi(getSupabaseSessionExists());
        setSyncRemoteActiveUi(getSyncRemoteActive());
        setSyncEntitledUi(getSyncEntitled());
      }),
    [],
  );

  useEffect(() => {
    if (!supabaseSessionExists || !syncEntitled || syncRemoteActive) {
      return;
    }
    try {
      if (sessionStorage.getItem(CLOUD_SYNC_AUTO_PROMPT_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    setEnableCloudSyncOpen(true);
  }, [supabaseSessionExists, syncEntitled, syncRemoteActive]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const exists = !!session?.user;
      setSupabaseSessionExists(exists);
      setAuthEmail(session?.user?.email ?? null);
      if (!exists) setSyncRemoteActive(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSupabaseSessionExists(false);
        setSyncRemoteActive(false);
        setAuthEmail(null);
        try {
          sessionStorage.removeItem(CLOUD_SYNC_AUTO_PROMPT_KEY);
        } catch {
          /* ignore */
        }
        setSignInSyncOpen(false);
        setEnableCloudSyncOpen(false);
        return;
      }
      const exists = !!session?.user;
      setSupabaseSessionExists(exists);
      setAuthEmail(session?.user?.email ?? null);
      if (!exists) {
        setSyncRemoteActive(false);
        setSignInSyncOpen(false);
        setEnableCloudSyncOpen(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const openSignInSyncModal = useCallback(() => setSignInSyncOpen(true), []);
  const closeSignInSyncModal = useCallback(() => setSignInSyncOpen(false), []);

  const openEnableCloudSyncModal = useCallback(() => setEnableCloudSyncOpen(true), []);
  const closeEnableCloudSyncModal = useCallback(() => setEnableCloudSyncOpen(false), []);
  const dismissCloudSyncWithoutEnabling = useCallback(() => {
    try {
      sessionStorage.setItem(CLOUD_SYNC_AUTO_PROMPT_KEY, '1');
    } catch {
      /* ignore */
    }
    setEnableCloudSyncOpen(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* still clear local gating so the app can recover */
    }
    setSupabaseSessionExists(false);
    setSyncRemoteActive(false);
    setAuthEmail(null);
    try {
      sessionStorage.removeItem(CLOUD_SYNC_AUTO_PROMPT_KEY);
    } catch {
      /* ignore */
    }
    closeSignInSyncModal();
    closeEnableCloudSyncModal();
  }, [closeSignInSyncModal, closeEnableCloudSyncModal]);

  const showSendCodeError = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage('Could not send email. Try again.');
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const value = {
    supabaseSessionExists,
    syncRemoteActive,
    authEmail,
    openSignInSyncModal,
    closeSignInSyncModal,
    openEnableCloudSyncModal,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInSyncModal
        open={signInSyncOpen}
        onClose={closeSignInSyncModal}
        onSendError={showSendCodeError}
      />
      <EnableCloudSyncModal
        open={enableCloudSyncOpen}
        onClose={dismissCloudSyncWithoutEnabling}
        onEnable={() => {
          try {
            sessionStorage.removeItem(CLOUD_SYNC_AUTO_PROMPT_KEY);
          } catch {
            /* ignore */
          }
          setSyncRemoteActive(true);
          setEnableCloudSyncOpen(false);
        }}
      />
      {toastMessage ? (
        <div
          className="fixed bottom-6 left-1/2 z-[120] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg bg-stone-900/90 px-4 py-2 text-center text-sm text-stone-100 shadow-lg dark:bg-stone-100/95 dark:text-stone-900"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- public hook
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
