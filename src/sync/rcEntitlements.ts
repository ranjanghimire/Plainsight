import type { CustomerInfo } from '@revenuecat/purchases-js';
import type { Purchases } from '@revenuecat/purchases-js';
import { SYNC_ENTITLEMENT_ID } from './syncEnabled';

/**
 * Detect `sync` using the same shapes as the RC web SDK (EntitlementInfos.active / .all).
 */
export function customerInfoHasSyncEntitlement(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false;
  const ci = info as CustomerInfo;
  const id = SYNC_ENTITLEMENT_ID;
  const ent = ci.entitlements;
  if (!ent || typeof ent !== 'object') return false;

  const active = ent.active as Record<string, { isActive?: boolean }> | undefined;
  const fromActive = active?.[id];
  if (fromActive && typeof fromActive === 'object') {
    if (fromActive.isActive === false) return false;
    return true;
  }

  const all = ent.all as Record<string, { isActive?: boolean }> | undefined;
  const fromAll = all?.[id];
  return Boolean(fromAll && typeof fromAll === 'object' && fromAll.isActive !== false);
}

/**
 * Preferred path: SDK's own entitlement check (handles edge cases vs hand-parsing).
 */
export async function purchasesSdkHasSyncEntitlement(purchases: Purchases): Promise<boolean> {
  try {
    if (await purchases.isEntitledTo(SYNC_ENTITLEMENT_ID)) return true;
  } catch {
    /* fall through */
  }
  try {
    const info = await purchases.getCustomerInfo();
    return customerInfoHasSyncEntitlement(info);
  } catch {
    return false;
  }
}
