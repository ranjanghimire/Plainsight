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
import { useAuth } from './AuthContext';
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
  const { openSendCodeModal } = useAuth();
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
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const toastTimerRef = useRef(null);
  /** True while OTP / session-restore queue is linking RevenueCat to the Supabase user (avoid flashing paywall). */
  const [isLinkingPurchasesToSession, setIsLinkingPurchasesToSession] = useState(false);
  /** True while check-sync-entitlement + SDK confirmation runs (hide Unlock for paid users until resolved). */
  const [isServerEntitlementCheckPending, setIsServerEntitlementCheckPending] = useState(false);

  useEffect(
    () => subscribeSyncGating(() => setSyncEntitled(getSyncEntitled())),
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  /**
   * @param {string} message
   * @param {{ persistent?: boolean; showUpgradeCta?: boolean }} [options]
   * - `persistent`: no auto-dismiss; user taps Got it (or Escape). Use for paywall / quota copy.
   * - `showUpgradeCta`: show Unlock cloud sync (opens paywall); only with persistent.
   */
  const showToast = useCallback(
    (message, options = {}) => {
      const text = typeof message === 'string' ? message.trim() : '';
      if (!text) return;
      const persistent = Boolean(options.persistent);
      const showUpgradeCta = persistent && Boolean(options.showUpgradeCta);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToast({ message: text, persistent, showUpgradeCta });
      if (!persistent) {
        toastTimerRef.current = window.setTimeout(dismissToast, 3200);
      }
    },
    [dismissToast],
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!toast?.persistent) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dismissToast();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast?.persistent, dismissToast]);

  useEffect(() => {
    if (!toast?.persistent) return;
    const t = window.setTimeout(() => {
      const el = toastRef.current?.querySelector('button');
      if (el instanceof HTMLElement) el.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [toast?.message, toast?.persistent]);

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
          return;
        }
        /**
         * Must link RevenueCat to this Supabase user id. Previously we returned here without
         * identifyUser when the ref was stale — the SDK stayed on the anonymous install user and
         * `sync` never appeared for the signed-in account.
         */
        try {
          let isAnon = false;
          try {
            isAnon = purchases.isAnonymous();
          } catch {
            isAnon = true;
          }
          if (isAnon && (await purchasesSdkHasSyncEntitlement(purchases))) {
            return;
          }
          const out = await purchases.identifyUser(uid);
          rcLinkedSupabaseUserIdRef.current = uid;
          applyCustomerInfo(unwrapCustomerInfo(out));
        } catch (e) {
          console.error('[RevenueCat] link logged-in user to RevenueCat', e);
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

        const [offerings, info] = await Promise.all([
          purchases.getOfferings(),
          purchases.getCustomerInfo(),
        ]);
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
    if (getSyncEntitled()) return;
    if (!hasCustomAuthSession()) {
      openSendCodeModal();
      return;
    }
    setPaywallSubtitle(null);
    setEnableSyncOpen(true);
  }, [openSendCodeModal]);
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

  /**
   * Authoritative paid check via check-sync-entitlement (RevenueCat REST) after the SDK has had
   * a chance to identify the Supabase user. Keeps menu off "Unlock" for subscribers even if SDK
   * parsing lags.
   */
  useEffect(() => {
    if (!revenueCatReady) return undefined;

    if (hasCustomAuthSession()) setIsServerEntitlementCheckPending(true);

    let cancelled = false;
    let debounceTimer = null;

    const reconcile = async () => {
      if (!hasCustomAuthSession()) {
        if (!cancelled) setIsServerEntitlementCheckPending(false);
        return;
      }
      const uid = getLocalSession().userId?.trim();
      if (!uid) {
        if (!cancelled) setIsServerEntitlementCheckPending(false);
        return;
      }

      if (!cancelled) setIsServerEntitlementCheckPending(true);
      try {
        const purchases = purchasesRef.current;
        if (purchases && rcLinkedSupabaseUserIdRef.current !== uid) {
          try {
            let isAnon = false;
            try {
              isAnon = purchases.isAnonymous();
            } catch {
              isAnon = true;
            }
            const anonPaid = isAnon && (await purchasesSdkHasSyncEntitlement(purchases));
            if (!anonPaid) {
              const out = await purchases.identifyUser(uid);
              rcLinkedSupabaseUserIdRef.current = uid;
              applyCustomerInfo(unwrapCustomerInfo(out));
            }
          } catch (e) {
            console.error('[RevenueCat] reconcile identify before entitlement check', e);
          }
        }

        const remote = await checkSyncEntitlementRemote(uid);
        if (cancelled) return;

        if (remote === true) {
          setSyncEntitlementActive(true);
          setSyncRemoteActive(true);
          return;
        }

        let sdk = false;
        if (purchases) {
          try {
            sdk = await purchasesSdkHasSyncEntitlement(purchases);
          } catch {
            sdk = false;
          }
        }

        if (remote === false) {
          if (!sdk) setSyncEntitlementActive(false);
          return;
        }

        if (sdk) {
          setSyncEntitlementActive(true);
          setSyncRemoteActive(true);
        }
      } finally {
        if (!cancelled) setIsServerEntitlementCheckPending(false);
      }
    };

    const schedule = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void reconcile();
      }, 280);
    };

    schedule();
    window.addEventListener('plainsight:local-session', schedule);

    return () => {
      cancelled = true;
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      window.removeEventListener('plainsight:local-session', schedule);
    };
  }, [revenueCatReady, applyCustomerInfo]);

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
    isSubscriptionStatusPending:
      isLinkingPurchasesToSession || isServerEntitlementCheckPending,
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
      {toast ? (
        <div
          ref={toastRef}
          className={`fixed bottom-6 left-1/2 z-[120] w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl bg-stone-900/95 px-4 text-sm text-stone-100 shadow-lg ring-1 ring-stone-700/40 dark:bg-stone-100/95 dark:text-stone-900 dark:ring-stone-300/50 ${
            toast.persistent ? 'py-4' : 'py-2.5 text-center'
          }`}
          role={toast.persistent ? 'alert' : 'status'}
          aria-live={toast.persistent ? 'assertive' : 'polite'}
        >
          <p className={toast.persistent ? 'text-center leading-snug' : ''}>{toast.message}</p>
          {toast.persistent ? (
            <div className="mt-3 flex flex-col gap-2">
              {toast.showUpgradeCta ? (
                <button
                  type="button"
                  onClick={() => {
                    dismissToast();
                    beginUpgradeFlow();
                  }}
                  className="w-full rounded-lg bg-stone-100 px-3 py-2.5 text-center text-sm font-medium text-stone-900 shadow-sm hover:bg-white dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
                >
                  {hasCustomAuthSession() ? 'Unlock cloud sync' : 'Sign in with email'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={dismissToast}
                className={`w-full rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
                  toast.showUpgradeCta
                    ? 'border border-stone-500/45 text-stone-100 hover:bg-stone-800/60 dark:border-stone-400/55 dark:text-stone-800 dark:hover:bg-stone-200/90'
                    : 'bg-stone-100 text-stone-900 hover:bg-white dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700'
                }`}
              >
                {toast.showUpgradeCta ? 'Got it' : 'Dismiss'}
              </button>
            </div>
          ) : null}
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
