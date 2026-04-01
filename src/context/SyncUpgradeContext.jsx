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

function isEmailAlreadyInUse(error) {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  return (
    m.includes('already in use') ||
    m.includes('already registered') ||
    m.includes('user already exists') ||
    m.includes('has already been registered')
  );
}

function reconcileVerifiedFromSession(session, setSyncStatus, setSyncEmail) {
  if (!session?.user) return;
  const email = session.user.email;
  const confirmed = session.user.email_confirmed_at || session.user.confirmed_at;
  if (email && confirmed) {
    setSyncStatus('verified');
    setSyncEmail(email);
  }
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      reconcileVerifiedFromSession(data.session, setSyncStatus, setSyncEmail);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      reconcileVerifiedFromSession(session, setSyncStatus, setSyncEmail);
    });

    return () => subscription.unsubscribe();
  }, []);

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

    const { error: upgradeError } = await supabase.auth.updateUser({
      email: trimmed,
    });

    if (!upgradeError) {
      setSyncStatus('pending');
      setSyncEmail(trimmed);
      return { error: null };
    }

    if (isEmailAlreadyInUse(upgradeError)) {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (signInError) {
        return { error: signInError.message };
      }
      setSyncStatus('pending');
      setSyncEmail(trimmed);
      return { error: null };
    }

    return { error: upgradeError.message };
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
