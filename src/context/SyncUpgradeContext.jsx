import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../sync/supabaseClient';
import { EnableSyncModal } from '../components/EnableSyncModal';

const STORAGE_KEY = 'plainsight_sync_upgrade';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { syncStatus: 'anonymous', syncEmail: null };
    const p = JSON.parse(raw);
    const syncStatus =
      p.syncStatus === 'pending' || p.syncStatus === 'verified'
        ? p.syncStatus
        : 'anonymous';
    const syncEmail = typeof p.syncEmail === 'string' ? p.syncEmail : null;
    return { syncStatus, syncEmail };
  } catch {
    return { syncStatus: 'anonymous', syncEmail: null };
  }
}

function writeStored(syncStatus, syncEmail) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ syncStatus, syncEmail }));
  } catch {
    /* ignore */
  }
}

function sessionIndicatesVerifiedEmail(session) {
  const user = session?.user;
  if (!user?.email) return false;
  return !!(user.email_confirmed_at || user.confirmed_at);
}

const SyncUpgradeContext = createContext(null);

export function SyncUpgradeProvider({ children }) {
  const stored = readStored();
  const [syncStatus, setSyncStatus] = useState(stored.syncStatus);
  const [syncEmail, setSyncEmail] = useState(stored.syncEmail);
  const [enableSyncModalOpen, setEnableSyncModalOpen] = useState(false);

  useEffect(() => {
    writeStored(syncStatus, syncEmail);
  }, [syncStatus, syncEmail]);

  const reconcileSession = useCallback((session) => {
    if (sessionIndicatesVerifiedEmail(session)) {
      const email = session.user.email;
      setSyncStatus('verified');
      setSyncEmail(email ?? null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      reconcileSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === 'USER_UPDATED' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED'
      ) {
        reconcileSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [reconcileSession]);

  /**
   * Entry point for “Upgrade to sync”. Today this opens the email modal; later this can
   * run a payment step before opening verification.
   */
  const beginUpgradeFlow = useCallback(() => {
    setEnableSyncModalOpen(true);
  }, []);

  const submitUpgradeEmail = useCallback(async (email) => {
    const trimmed = (email || '').trim();
    if (!trimmed) {
      return { error: 'Please enter your email.' };
    }
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) {
      return { error: error.message };
    }
    setSyncStatus('pending');
    setSyncEmail(trimmed);
    return { error: null };
  }, []);

  const value = {
    syncStatus,
    syncEmail,
    beginUpgradeFlow,
    setEnableSyncModalOpen,
    submitUpgradeEmail,
  };

  return (
    <SyncUpgradeContext.Provider value={value}>
      {children}
      <EnableSyncModal
        open={enableSyncModalOpen}
        onClose={() => setEnableSyncModalOpen(false)}
        onSubmit={submitUpgradeEmail}
      />
    </SyncUpgradeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is the public API
export function useSyncUpgrade() {
  const ctx = useContext(SyncUpgradeContext);
  if (!ctx) {
    throw new Error('useSyncUpgrade must be used within SyncUpgradeProvider');
  }
  return ctx;
}
