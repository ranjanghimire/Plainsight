import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  getSupabaseSessionExists,
  subscribeSyncGating,
  setSyncRemoteActive,
  getSyncRemoteActive,
  getSyncEntitled,
} from '../sync/syncEnabled';
import {
  clearSession,
  ensureLocalSession,
  getSession as getLocalSession,
  LOCAL_DEV_SESSION_TOKEN,
  LOCAL_DEV_USER_ID,
} from '../auth/localSession';
import { fetchSessionUser } from '../auth/fetchSessionUser';
import { verifyCode } from '../auth/verifyCode';
import { EnableCloudSyncModal } from '../components/EnableCloudSyncModal';
import { SendCodeModal } from '../components/SendCodeModal';

const CLOUD_SYNC_AUTO_PROMPT_KEY = 'plainsight_cloud_sync_auto_prompted';
const AUTH_DISPLAY_EMAIL_KEY = 'plainsight_auth_display_email';

function readStoredAuthEmail() {
  try {
    return sessionStorage.getItem(AUTH_DISPLAY_EMAIL_KEY);
  } catch {
    return null;
  }
}

function isLocalDevSession() {
  const { sessionToken, userId } = getLocalSession();
  return (
    sessionToken === LOCAL_DEV_SESSION_TOKEN &&
    userId === LOCAL_DEV_USER_ID
  );
}

function readInitialAuthEmail() {
  if (isLocalDevSession()) return 'local@plainsight.dev';
  const stored = readStoredAuthEmail();
  if (stored) return stored;
  const uid = getLocalSession().userId;
  if (!uid) return null;
  return null;
}

function resolveAuthEmailForSession() {
  if (isLocalDevSession()) return 'local@plainsight.dev';
  const stored = readStoredAuthEmail();
  if (stored) return stored;
  const uid = getLocalSession().userId;
  if (!uid) return null;
  return null;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [supabaseSessionExists, setSessionExistsUi] = useState(
    () => getSupabaseSessionExists(),
  );
  const [syncRemoteActive, setSyncRemoteActiveUi] = useState(() => getSyncRemoteActive());
  const [syncEntitled, setSyncEntitledUi] = useState(() => getSyncEntitled());
  const [enableCloudSyncOpen, setEnableCloudSyncOpen] = useState(false);
  const [sendCodeOpen, setSendCodeOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState(() => readInitialAuthEmail());

  useEffect(
    () =>
      subscribeSyncGating(() => {
        setSessionExistsUi(getSupabaseSessionExists());
        setSyncRemoteActiveUi(getSyncRemoteActive());
        setSyncEntitledUi(getSyncEntitled());
        setAuthEmail(resolveAuthEmailForSession());
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
    if (!supabaseSessionExists) setSyncRemoteActive(false);
  }, [supabaseSessionExists]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { sessionToken, userId } = getLocalSession();
      if (!sessionToken || !userId) return;
      if (isLocalDevSession()) {
        setAuthEmail('local@plainsight.dev');
        return;
      }
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!baseUrl || !anonKey) return;

      const result = await fetchSessionUser(sessionToken);
      if (cancelled) return;

      if (!result.loggedIn) {
        clearSession();
        setSyncRemoteActive(false);
        try {
          sessionStorage.removeItem(CLOUD_SYNC_AUTO_PROMPT_KEY);
          sessionStorage.removeItem(AUTH_DISPLAY_EMAIL_KEY);
        } catch {
          /* ignore */
        }
        setAuthEmail(null);
        ensureLocalSession();
        return;
      }

      setAuthEmail(result.email);
      try {
        sessionStorage.setItem(AUTH_DISPLAY_EMAIL_KEY, result.email);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // One-time startup validation of persisted OTP session.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const restoreLocalSession = useCallback(() => {
    ensureLocalSession();
  }, []);

  const openSendCodeModal = useCallback(() => setSendCodeOpen(true), []);
  const closeSendCodeModal = useCallback(() => setSendCodeOpen(false), []);

  const loginWithCode = useCallback(async (email, code) => {
    const result = await verifyCode(email, code);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    setSyncRemoteActive(false);
    try {
      sessionStorage.setItem(AUTH_DISPLAY_EMAIL_KEY, result.email);
    } catch {
      /* ignore */
    }
    setAuthEmail(result.email);
    closeSendCodeModal();
    return { ok: true };
  }, [closeSendCodeModal]);

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

  const signOut = useCallback(() => {
    clearSession();
    setSyncRemoteActive(false);
    try {
      sessionStorage.removeItem(CLOUD_SYNC_AUTO_PROMPT_KEY);
      sessionStorage.removeItem(AUTH_DISPLAY_EMAIL_KEY);
    } catch {
      /* ignore */
    }
    setEnableCloudSyncOpen(false);
    setAuthEmail(null);
  }, []);

  const value = {
    supabaseSessionExists,
    syncRemoteActive,
    authEmail,
    restoreLocalSession,
    openSendCodeModal,
    verifyCodeLogin: loginWithCode,
    openEnableCloudSyncModal,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SendCodeModal
        open={sendCodeOpen}
        onClose={closeSendCodeModal}
        loginWithCode={loginWithCode}
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
