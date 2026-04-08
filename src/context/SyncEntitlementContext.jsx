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
  getSyncEntitled,
  setSyncEntitlementActive,
  hasCustomAuthSession,
  setSyncRemoteActive,
  subscribeSyncGating,
} from '../sync/syncEnabled';
import { getSession as getLocalSession } from '../auth/localSession';
import { readAuthDisplayEmail } from '../auth/authDisplayEmail';
import { checkSyncEntitlementRemote } from '../auth/checkSyncEntitlementRemote';
import { drainOtpSessionQueue, OTP_SESSION_QUEUE_CHANGED } from '../auth/otpSessionQueue';
import { EnableSyncModal } from '../components/EnableSyncModal';
import {
  customerInfoHasSyncEntitlement,
  purchasesSdkHasSyncEntitlement,
} from '../sync/rcEntitlements';

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

/** purchases-js may return CustomerInfo or { customerInfo }. */
function unwrapCustomerInfo(result) {
  if (result && typeof result === 'object' && 'entitlements' in result) return result;
  if (result?.customerInfo) return result.customerInfo;
  return result;
}

const SyncEntitlementContext = createContext(null);

export function SyncEntitlementProvider({ children }) {
  const purchasesRef = useRef(null);
  /** Last Supabase user id passed to RevenueCat identifyUser; null when using anonymous RC user. */
  const rcLinkedSupabaseUserIdRef = useRef(null);
  const [syncEntitled, setSyncEntitled] = useState(() => getSyncEntitled());
  const [defaultOffering, setDefaultOffering] = useState(null);
  const [lifetimePackage, setLifetimePackage] = useState(null);
  const [revenueCatReady, setRevenueCatReady] = useState(false);
  const [enableSyncOpen, setEnableSyncOpen] = useState(false);
  const [paywallSubtitle, setPaywallSubtitle] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  /** True while OTP / session-restore queue is linking RevenueCat to the Supabase user (avoid flashing paywall). */
  const [isLinkingPurchasesToSession, setIsLinkingPurchasesToSession] = useState(false);

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
    const active = customerInfoHasSyncEntitlement(info);
    setSyncEntitlementActive(active);
    return active;
  }, []);

  /**
   * Tie RevenueCat to the same id as public.users so sync entitlement survives across browsers
   * when the user signs in with the same email (anonymous RC id is per-browser otherwise).
   */
  const syncRevenueCatToPlainSightSession = useCallback(async () => {
    const purchases = purchasesRef.current;
    if (!purchases) return;
    try {
      if (hasCustomAuthSession()) {
        const uid = getLocalSession().userId?.trim();
        if (!uid) return;
        if (rcLinkedSupabaseUserIdRef.current === uid) {
          try {
            const info = await purchases.getCustomerInfo();
            applyCustomerInfo(info);
          } catch (e) {
            console.error('[RevenueCat] refresh customer info', e);
          }
        }
        return;
      }

      let anonymous = false;
      try {
        anonymous = purchases.isAnonymous();
      } catch {
        anonymous = true;
      }
      if (rcLinkedSupabaseUserIdRef.current === null && anonymous) return;

      const nextAnon = Purchases.generateRevenueCatAnonymousAppUserId();
      try {
        localStorage.setItem(RC_ANON_USER_STORAGE_KEY, nextAnon);
      } catch {
        /* ignore */
      }
      const out = await purchases.changeUser(nextAnon);
      rcLinkedSupabaseUserIdRef.current = null;
      applyCustomerInfo(unwrapCustomerInfo(out));
    } catch (e) {
      console.error('[RevenueCat] sync identity to PlainSight session', e);
    }
  }, [applyCustomerInfo]);

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

  useEffect(() => {
    if (!revenueCatReady) return undefined;
    void syncRevenueCatToPlainSightSession();
    return subscribeSyncGating(() => {
      void syncRevenueCatToPlainSightSession();
    });
  }, [revenueCatReady, syncRevenueCatToPlainSightSession]);

  const beginUpgradeFlow = useCallback(() => {
    setPaywallSubtitle(null);
    setEnableSyncOpen(true);
  }, []);
  const closeEnableSync = useCallback(() => {
    setEnableSyncOpen(false);
    setPaywallSubtitle(null);
  }, []);

  const purchaseUnlockSync = useCallback(async (billingMountEl) => {
    const purchases = purchasesRef.current;
    const pkg = lifetimePackage;
    if (!purchases || !pkg) {
      showToast('Sync package is not available yet.');
      return;
    }
    if (!(billingMountEl instanceof HTMLElement)) {
      showToast('Unable to start checkout.');
      return;
    }
    setUnlocking(true);
    try {
      const result = await purchases.purchase({
        rcPackage: pkg,
        htmlTarget: billingMountEl,
        customerEmail: readAuthDisplayEmail() ?? undefined,
        skipSuccessPage: true,
      });
      let ci = unwrapCustomerInfo(result);
      let active = customerInfoHasSyncEntitlement(ci);
      if (active && hasCustomAuthSession()) {
        const uid = getLocalSession().userId?.trim();
        if (uid) {
          try {
            const linked = await purchases.identifyUser(uid);
            rcLinkedSupabaseUserIdRef.current = uid;
            ci = unwrapCustomerInfo(linked);
            active = customerInfoHasSyncEntitlement(ci);
          } catch (e) {
            console.error('[RevenueCat] identify after purchase', e);
          }
        }
      }
      applyCustomerInfo(ci);
      if (active) {
        setSyncRemoteActive(true);
        setEnableSyncOpen(false);
        showToast('Cloud sync is on');
      } else {
        showToast('Could not verify sync unlock.');
      }
    } catch (e) {
      if (e?.errorCode === ErrorCode.UserCancelledError) return;
      showToast(e?.message || 'Something went wrong. Try again.');
    } finally {
      setUnlocking(false);
    }
  }, [applyCustomerInfo, lifetimePackage, showToast]);

  const processOtpSessionQueue = useCallback(async () => {
    const purchases = purchasesRef.current;
    if (!purchases) return;
    const batch = drainOtpSessionQueue();
    if (batch.length) setIsLinkingPurchasesToSession(true);
    try {
      for (const item of batch) {
        const finish = item.done;
        try {
          const { userId, source } = item;
          if (!userId?.trim()) continue;
          const uid = userId.trim();

          /**
           * Server check by Supabase user id first.
           * On a *new device*, GET /subscribers/{uid} can lag behind or return 404 until RevenueCat
           * has been switched to that app user id — so for OTP verify we may still need identifyUser
           * when the anonymous RC user does **not** already have `sync` (avoids gifting a local
           * anonymous/test purchase to an arbitrary email).
           */
          const remoteEntitled = await checkSyncEntitlementRemote(uid);

          if (remoteEntitled === true) {
            setSyncEntitlementActive(true);
            try {
              const out = await purchases.identifyUser(uid);
              rcLinkedSupabaseUserIdRef.current = uid;
              applyCustomerInfo(unwrapCustomerInfo(out));
            } catch (e) {
              console.error('[RevenueCat] post sign-in identify', e);
            }
            setSyncRemoteActive(true);
            if (source === 'verify') showToast('Cloud sync is on');
          } else {
            if (remoteEntitled === null) {
              console.warn(
                '[RevenueCat] check-sync-entitlement unavailable; leaving entitlement unchanged',
              );
            }
            if (source === 'restore') {
              /**
               * App reopen: link RC to Supabase user, then trust SDK + server (parallel).
               */
              try {
                const out = await purchases.identifyUser(uid);
                rcLinkedSupabaseUserIdRef.current = uid;
                applyCustomerInfo(unwrapCustomerInfo(out));
                const [sdkEntitled, remoteAfter] = await Promise.all([
                  purchasesSdkHasSyncEntitlement(purchases),
                  checkSyncEntitlementRemote(uid),
                ]);
                const entitled = sdkEntitled || remoteAfter === true;
                if (entitled) {
                  setSyncEntitlementActive(true);
                  setSyncRemoteActive(true);
                } else if (remoteAfter === false && !sdkEntitled) {
                  setSyncEntitlementActive(false);
                  setSyncRemoteActive(false);
                }
              } catch (e) {
                console.error('[RevenueCat] restore session RevenueCat link', e);
              }
            } else if (source === 'verify') {
              let anonHasSync = false;
              try {
                anonHasSync = await purchasesSdkHasSyncEntitlement(purchases);
              } catch {
                anonHasSync = false;
              }

              if (anonHasSync) {
                // Anonymous RC user already has sync — do not merge onto this OTP account.
                setSyncEntitlementActive(false);
                setSyncRemoteActive(false);
                showToast(
                  'Cloud sync on this browser is tied to another profile. Clear site data and sign in again, or use Unlock if you need a new subscription.',
                );
                continue;
              }

              try {
                const out = await purchases.identifyUser(uid);
                rcLinkedSupabaseUserIdRef.current = uid;
                applyCustomerInfo(unwrapCustomerInfo(out));
                const [sdkEntitled, remoteAfter] = await Promise.all([
                  purchasesSdkHasSyncEntitlement(purchases),
                  checkSyncEntitlementRemote(uid),
                ]);
                const entitled = sdkEntitled || remoteAfter === true;

                if (entitled) {
                  setSyncEntitlementActive(true);
                  setSyncRemoteActive(true);
                  showToast('Cloud sync is on');
                } else if (remoteAfter === false && !sdkEntitled) {
                  setSyncEntitlementActive(false);
                  setSyncRemoteActive(false);
                } else {
                  showToast('Could not verify sync status right now. Try again in a moment.');
                }
              } catch (e) {
                console.error('[RevenueCat] verify session RevenueCat link', e);
                showToast('Could not verify sync status right now. Try again in a moment.');
              }
            }
          }
        } catch (e) {
          console.error('[RevenueCat] post sign-in identify', e);
        } finally {
          finish?.();
        }
      }
    } finally {
      if (batch.length) setIsLinkingPurchasesToSession(false);
    }
  }, [applyCustomerInfo, showToast]);

  useEffect(() => {
    if (!revenueCatReady) return undefined;
    const run = () => {
      void processOtpSessionQueue();
    };
    run();
    window.addEventListener(OTP_SESSION_QUEUE_CHANGED, run);
    return () => window.removeEventListener(OTP_SESSION_QUEUE_CHANGED, run);
  }, [revenueCatReady, processOtpSessionQueue]);

  const value = {
    syncEntitled,
    revenueCatReady,
    defaultOffering,
    lifetimePackage,
    beginUpgradeFlow,
    closeEnableSync,
    purchaseUnlockSync,
    showToast,
    isLinkingPurchasesToSession,
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
        subtitle={paywallSubtitle}
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
