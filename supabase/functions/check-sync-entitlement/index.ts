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

function parseRcEntitled(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const sub = (data as { subscriber?: Record<string, unknown> }).subscriber;
  if (!sub || typeof sub !== 'object') return false;

  const entitlements = sub.entitlements as Record<string, unknown> | undefined;
  if (!entitlements || typeof entitlements !== 'object') return false;

  const active = entitlements.active as Record<string, unknown> | undefined;
  if (active && typeof active === 'object' && SYNC_ENTITLEMENT_ID in active) {
    const row = active[SYNC_ENTITLEMENT_ID] as { expires_date?: string | null } | undefined;
    if (row && typeof row === 'object') {
      const exp = row.expires_date;
      if (exp == null || exp === '') return true;
      const t = Date.parse(String(exp));
      if (Number.isNaN(t)) return true;
      return t > Date.now();
    }
    return true;
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
