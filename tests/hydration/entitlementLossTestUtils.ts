/**
 * Deterministic entitlement toggles for Vitest (pairs with `__PS_TEST_FLAGS__` RC + entitlement mocks).
 */

import { act } from '@testing-library/react';
import {
  setSyncEntitlementActive,
  setSyncRemoteActive,
} from '../../src/sync/syncEnabled';
import { resetSyncQueueForTests } from '../../src/sync/syncHelpers';

export function getVitestSessionUserIdForPaid(): string | null {
  return process.env.VITEST_SUPABASE_USER_ID?.trim() || null;
}

/** Keep session user id so `checkSyncEntitlementRemote` mock stays consistent with flags. */
export function applyVitestPaidSyncFlags(paid: boolean): void {
  const uid =
    globalThis.__PS_TEST_FLAGS__?.sessionUserId?.trim() ||
    getVitestSessionUserIdForPaid() ||
    null;
  globalThis.__PS_TEST_FLAGS__ = { paidSync: paid, sessionUserId: uid };
}

/** Mid-session: mirrors provider turning off paid sync (RevenueCat + persisted remote flag). */
export async function simulateEntitlementLossMidSession(): Promise<void> {
  applyVitestPaidSyncFlags(false);
  await act(async () => {
    setSyncEntitlementActive(false);
    setSyncRemoteActive(false);
  });
  resetSyncQueueForTests();
}

/** Restore paid flags + gating (same process / remount scenarios). */
export async function simulateEntitlementRestoreForVitestSession(): Promise<void> {
  applyVitestPaidSyncFlags(true);
  await act(async () => {
    setSyncEntitlementActive(true);
    setSyncRemoteActive(true);
  });
}
