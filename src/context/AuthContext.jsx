import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getSupabaseSessionExists,
  subscribeSyncGating,
  setSyncRemoteActive,
  getSyncRemoteActive,
  hasCustomAuthSession,
  persistLastKnownSyncEntitledForMenu,
} from '../sync/syncEnabled';
import {
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
import { sendClientErrorReport } from '../telemetry/clientErrorReporter';
import { clearSharedWorkspaceMenuCache } from '../utils/storage';
import { clearAllLocalClientState } from '../utils/clearAllLocalClientState';

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
  const [sendCodeOpen, setSendCodeOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState(() => readInitialAuthEmail());
  /** False until custom-session validation finishes (avoids “Unlock” + “Sign out” before we know the account). */
  const [authReady, setAuthReady] = useState(() => {
    const { sessionToken, userId } = getLocalSession();
    if (!sessionToken || !userId) return true;
    if (isLocalDevSession()) return true;
    return false;
  });
  /** Session edge lookup timed out / failed — menu shows amber sync dot instead of a toast. */
  const [authConnectivityDegraded, setAuthConnectivityDegraded] = useState(false);
  const sessionValidationTicketRef = useRef(0);

  useEffect(
    () =>
      subscribeSyncGating(() => {
        if (!hasCustomAuthSession()) setSyncRemoteActive(false);
        setSessionExistsUi(getSupabaseSessionExists());
        setSyncRemoteActiveUi(getSyncRemoteActive());
        setAuthEmail(resolveAuthEmailForSession());
      }),
    [],
  );

  const runRemoteSessionValidation = useCallback(async () => {
    const ticket = ++sessionValidationTicketRef.current;
    try {
      const { sessionToken, userId } = getLocalSession();
      if (!sessionToken || !userId) return;
      if (isLocalDevSession()) {
        if (ticket === sessionValidationTicketRef.current) {
          setAuthEmail('local@plainsight.dev');
          setAuthConnectivityDegraded(false);
        }
        return;
      }
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!baseUrl || !anonKey) {
        if (ticket === sessionValidationTicketRef.current) {
          setAuthConnectivityDegraded(false);
        }
        return;
      }

      const result = await fetchSessionUser(sessionToken);
      if (ticket !== sessionValidationTicketRef.current) return;

      if (!result.loggedIn) {
        if (result.staleNetwork) {
          setAuthConnectivityDegraded(true);
          void sendClientErrorReport({
            type: 'auth.session_degraded',
            message: 'Session restore: stale network (could not validate session)',
          });
          return;
        }
        // `auth-session-user` returns loggedIn:false for expired sessions, missing rows, and
        // transient DB/network failures — the client cannot tell them apart. Clearing here
        // caused false "signed out" on flaky PWAs while notes stayed in localStorage, which
        // could leave the device without a dev placeholder session and block "existing account"
        // sign-in (shouldBlockExistingAccountSignIn). Keep OTP credentials until explicit
        // Sign out; show the same degraded indicator as unreliable connectivity.
        setAuthConnectivityDegraded(true);
        void sendClientErrorReport({
          type: 'auth.session_degraded',
          message:
            'Session restore: ambiguous not-logged-in response; keeping local session (use Sign out to clear)',
        });
        return;
      }

      setAuthConnectivityDegraded(false);
      setAuthEmail(result.email);
      persistAuthDisplayEmail(result.email);

      enqueueOtpSessionProcessing({
        userId: result.userId,
        email: result.email,
        source: 'restore',
      });
    } catch (e) {
      console.error('[Auth] session restore', e);
      if (ticket === sessionValidationTicketRef.current) {
        setAuthConnectivityDegraded(true);
        void sendClientErrorReport({
          type: 'auth.session_degraded',
          message: 'Session restore: exception while validating session',
          stack: e instanceof Error ? e.stack : String(e),
        });
      }
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void runRemoteSessionValidation();
  }, [runRemoteSessionValidation]);

  useEffect(() => {
    const onOnline = () => {
      if (!hasCustomAuthSession() || isLocalDevSession()) return;
      void runRemoteSessionValidation();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [runRemoteSessionValidation]);

  /** PWA / background: `online` may not fire when the OS resumes the WebView. Re-check session so the amber dot can clear. */
  useEffect(() => {
    let debounce = null;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!hasCustomAuthSession() || isLocalDevSession()) return;
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        void runRemoteSessionValidation();
      }, 350);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (debounce != null) window.clearTimeout(debounce);
    };
  }, [runRemoteSessionValidation]);

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

  const signOut = useCallback(async () => {
    const uid = getLocalSession().userId;
    sessionValidationTicketRef.current += 1;
    setAuthConnectivityDegraded(false);
    clearSharedWorkspaceMenuCache(uid);
    await clearAllLocalClientState('logout');
    persistLastKnownSyncEntitledForMenu(null);
    setSyncRemoteActive(false);
    clearAuthDisplayEmailStorage();
    setAuthEmail(null);
    window.location.assign('/');
  }, []);

  const value = {
    supabaseSessionExists,
    syncRemoteActive,
    authEmail,
    authReady,
    authConnectivityDegraded,
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
