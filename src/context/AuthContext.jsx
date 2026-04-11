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
  hasCustomAuthSession,
  persistLastKnownSyncEntitledForMenu,
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
import { enqueueOtpSessionProcessing } from '../auth/otpSessionQueue';
import {
  clearAuthDisplayEmailStorage,
  persistAuthDisplayEmail,
  readAuthDisplayEmail,
} from '../auth/authDisplayEmail';
import { SendCodeModal } from '../components/SendCodeModal';

function isLocalDevSession() {
  const { sessionToken, userId } = getLocalSession();
  return (
    sessionToken === LOCAL_DEV_SESSION_TOKEN &&
    userId === LOCAL_DEV_USER_ID
  );
}

function readInitialAuthEmail() {
  if (isLocalDevSession()) return 'local@plainsight.dev';
  const stored = readAuthDisplayEmail();
  if (stored) return stored;
  const uid = getLocalSession().userId;
  if (!uid) return null;
  return null;
}

function resolveAuthEmailForSession() {
  if (isLocalDevSession()) return 'local@plainsight.dev';
  const stored = readAuthDisplayEmail();
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
  const [sendCodeOpen, setSendCodeOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState(() => readInitialAuthEmail());
  /** False until custom-session validation finishes (avoids “Unlock” + “Sign out” before we know the account). */
  const [authReady, setAuthReady] = useState(() => {
    const { sessionToken, userId } = getLocalSession();
    if (!sessionToken || !userId) return true;
    if (isLocalDevSession()) return true;
    return false;
  });

  useEffect(
    () =>
      subscribeSyncGating(() => {
        if (!hasCustomAuthSession()) setSyncRemoteActive(false);
        setSessionExistsUi(getSupabaseSessionExists());
        setSyncRemoteActiveUi(getSyncRemoteActive());
        setSyncEntitledUi(getSyncEntitled());
        setAuthEmail(resolveAuthEmailForSession());
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
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
          persistLastKnownSyncEntitledForMenu(false);
          clearSession();
          setSyncRemoteActive(false);
          clearAuthDisplayEmailStorage();
          setAuthEmail(null);
          ensureLocalSession();
          return;
        }

        setAuthEmail(result.email);
        persistAuthDisplayEmail(result.email);

        await new Promise((resolve) => {
          enqueueOtpSessionProcessing({
            userId: result.userId,
            email: result.email,
            source: 'restore',
            done: resolve,
          });
        });
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
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
    persistAuthDisplayEmail(result.email);
    setAuthEmail(result.email);

    await new Promise((resolve) => {
      enqueueOtpSessionProcessing({
        userId: result.userId,
        email: result.email,
        source: 'verify',
        done: resolve,
      });
    });

    closeSendCodeModal();
    return { ok: true };
  }, [closeSendCodeModal]);

  const signOut = useCallback(() => {
    persistLastKnownSyncEntitledForMenu(null);
    clearSession();
    setSyncRemoteActive(false);
    clearAuthDisplayEmailStorage();
    setAuthEmail(null);
  }, []);

  const value = {
    supabaseSessionExists,
    syncRemoteActive,
    authEmail,
    authReady,
    restoreLocalSession,
    openSendCodeModal,
    verifyCodeLogin: loginWithCode,
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
