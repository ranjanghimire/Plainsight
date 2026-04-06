import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Purchases, ErrorCode, PackageType } from '@revenuecat/purchases-js';
import {
  setSyncEntitlementActive,
  getSyncEntitled,
  subscribeSyncGating,
  SYNC_ENTITLEMENT_ID,
} from '../sync/syncEnabled';
import { EnableSyncModal } from '../components/EnableSyncModal';

const REVENUECAT_PUBLIC_API_KEY = 'test_smZiwCGJjgwRtkaZwQOrEZhEPfj';
const RC_ANON_USER_STORAGE_KEY = 'plainsight_rc_anonymous_app_user_id';

function getOrCreateRcAnonymousAppUserId() {
  try {
    let id = localStorage.getItem(RC_ANON_USER_STORAGE_KEY);
    if (!id?.trim()) {
      id = Purchases.generateRevenueCatAnonymousAppUserId();
      localStorage.setItem(RC_ANON_USER_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return Purchases.generateRevenueCatAnonymousAppUserId();
  }
}

function customerInfoHasSync(info) {
  return Boolean(info?.entitlements?.active?.[SYNC_ENTITLEMENT_ID]);
}

const SyncEntitlementContext = createContext(null);

export function SyncEntitlementProvider({ children }) {
  const purchasesRef = useRef(null);
  const [syncEntitled, setSyncEntitled] = useState(() => getSyncEntitled());
  const [defaultOffering, setDefaultOffering] = useState(null);
  const [lifetimePackage, setLifetimePackage] = useState(null);
  const [revenueCatReady, setRevenueCatReady] = useState(false);
  const [enableSyncOpen, setEnableSyncOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(
    () => subscribeSyncGating(() => setSyncEntitled(getSyncEntitled())),
    [],
  );

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const applyCustomerInfo = useCallback((info) => {
    const active = customerInfoHasSync(info);
    setSyncEntitlementActive(active);
    return active;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const appUserId = getOrCreateRcAnonymousAppUserId();
        const purchases = Purchases.configure({
          apiKey: REVENUECAT_PUBLIC_API_KEY,
          appUserId,
        });
        purchasesRef.current = purchases;

        const offerings = await purchases.getOfferings();
        if (cancelled) return;

        const current = offerings?.current ?? null;
        setDefaultOffering(current);
        const lifetime =
          current?.availablePackages?.find(
            (p) =>
              p.identifier === '$rc_lifetime' ||
              p.packageType === PackageType.Lifetime,
          ) ?? null;
        setLifetimePackage(lifetime);

        const info = await purchases.getCustomerInfo();
        if (cancelled) return;
        applyCustomerInfo(info);
      } catch (e) {
        console.error('[RevenueCat]', e);
        setSyncEntitlementActive(false);
      } finally {
        if (!cancelled) setRevenueCatReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCustomerInfo]);

  const beginUpgradeFlow = useCallback(() => setEnableSyncOpen(true), []);
  const closeEnableSync = useCallback(() => setEnableSyncOpen(false), []);

  const purchaseUnlockSync = useCallback(async () => {
    const purchases = purchasesRef.current;
    const pkg = lifetimePackage;
    if (!purchases || !pkg) {
      showToast('Sync package is not available yet.');
      return;
    }
    setUnlocking(true);
    try {
      const result = await purchases.purchasePackage(pkg);
      const active = customerInfoHasSync(result.customerInfo);
      setSyncEntitlementActive(active);
      if (active) {
        setEnableSyncOpen(false);
      } else {
        showToast('Could not verify sync unlock.');
      }
    } catch (e) {
      if (e?.errorCode === ErrorCode.UserCancelledError) return;
      showToast(e?.message || 'Something went wrong. Try again.');
    } finally {
      setUnlocking(false);
    }
  }, [lifetimePackage, showToast]);

  const value = {
    syncEntitled,
    revenueCatReady,
    defaultOffering,
    lifetimePackage,
    beginUpgradeFlow,
    closeEnableSync,
    purchaseUnlockSync,
  };

  return (
    <SyncEntitlementContext.Provider value={value}>
      {children}
      <EnableSyncModal
        open={enableSyncOpen}
        onClose={closeEnableSync}
        onUnlockSync={purchaseUnlockSync}
        unlockDisabled={!lifetimePackage || !revenueCatReady}
        unlocking={unlocking}
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
    </SyncEntitlementContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- public hook
export function useSyncEntitlement() {
  const ctx = useContext(SyncEntitlementContext);
  if (!ctx) {
    throw new Error('useSyncEntitlement must be used within SyncEntitlementProvider');
  }
  return ctx;
}
