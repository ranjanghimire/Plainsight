/**
 * Server-side RevenueCat check by Supabase user id (same id used as RC app user id after identify).
 */

import { invokeEdgeFunction } from './functionsInvoke';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checkSyncEntitlementRemote(userId: string): Promise<boolean | null> {
  const id = userId?.trim();
  if (!id || !UUID_RE.test(id)) return null;

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !anonKey) return null;

  const { data, error } = await invokeEdgeFunction<{ syncEntitled?: boolean }>(
    'check-sync-entitlement',
    {
      body: { userId: id },
    },
  );

  if (error || !data) return null;
  if (typeof data.syncEntitled === 'boolean') return data.syncEntitled;
  return null;
}
