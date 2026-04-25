const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Must match SYNC_ENTITLEMENT_ID in src/sync/syncEnabled.ts */
const SYNC_ENTITLEMENT_ID = 'sync';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isSyncEntitlementRowActive(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const exp = (row as { expires_date?: string | null }).expires_date;
  if (exp == null || exp === '') return true;
  const t = Date.parse(String(exp));
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

/**
 * REST GET /v1/subscribers/{id} returns entitlements as a flat map:
 * `subscriber.entitlements.{entitlement_id}: { expires_date, ... }`.
 * Some payloads use a nested `entitlements.active` object (SDK-shaped); support both.
 */
function parseRcEntitled(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const sub = (data as { subscriber?: Record<string, unknown> }).subscriber;
  if (!sub || typeof sub !== 'object') return false;

  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  if (!entitlements || typeof entitlements !== 'object') return false;

  const active = entitlements.active as Record<string, unknown> | undefined;
  if (active && typeof active === 'object' && SYNC_ENTITLEMENT_ID in active) {
    return isSyncEntitlementRowActive(active[SYNC_ENTITLEMENT_ID]);
  }

  if (SYNC_ENTITLEMENT_ID in entitlements) {
    return isSyncEntitlementRowActive(entitlements[SYNC_ENTITLEMENT_ID]);
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret?.trim()) {
    console.error('check-sync-entitlement: missing REVENUECAT_SECRET_API_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId || !UUID_RE.test(userId)) {
    return json({ error: 'Invalid user id' }, 400);
  }

  /**
   * App Store review bypass:
   * treat the Apple review account as entitled regardless of RevenueCat state.
   * This is intentionally narrow (exact email match) and requires service role to resolve id→email.
   */
  try {
    const reviewEmail = (Deno.env.get('APPLE_REVIEW_EMAIL') ?? 'apple-review@plainsight.app')
      .trim()
      .toLowerCase();
    const sbUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
    if (reviewEmail && sbUrl && serviceKey) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
      const supabase = createClient(sbUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userRow } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      const email = typeof userRow?.email === 'string' ? userRow.email.trim().toLowerCase() : '';
      if (email && email === reviewEmail) {
        return json({ syncEntitled: true });
      }
    }
  } catch (e) {
    // If this lookup fails, fall back to RevenueCat below.
    console.warn('check-sync-entitlement: review override lookup failed', e);
  }

  const rcUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`;

  try {
    const rcRes = await fetch(rcUrl, {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    });

    if (rcRes.status === 404) {
      return json({ syncEntitled: false });
    }

    if (!rcRes.ok) {
      console.error('check-sync-entitlement: RC', rcRes.status, await rcRes.text());
      return json({ error: 'Entitlement check failed' }, 502);
    }

    const data = await rcRes.json();
    return json({ syncEntitled: parseRcEntitled(data) });
  } catch (e) {
    console.error('check-sync-entitlement:', e);
    return json({ error: 'Entitlement check failed' }, 502);
  }
});
