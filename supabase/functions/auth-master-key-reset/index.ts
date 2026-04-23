import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-plainsight-session',
};

const SYNC_ENTITLEMENT_ID = 'sync';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSixDigit(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

function isSyncEntitlementRowActive(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const exp = (row as { expires_date?: string | null }).expires_date;
  if (exp == null || exp === '') return true;
  const t = Date.parse(String(exp));
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

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

async function subscriberHasSyncEntitlement(userId: string): Promise<boolean | 'error'> {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret?.trim()) {
    console.error('auth-master-key-reset: missing REVENUECAT_SECRET_API_KEY');
    return 'error';
  }
  const rcUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`;
  try {
    const rcRes = await fetch(rcUrl, {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    });
    if (rcRes.status === 404) return false;
    if (!rcRes.ok) {
      console.error('auth-master-key-reset: RC', rcRes.status, await rcRes.text());
      return 'error';
    }
    const data = await rcRes.json();
    return parseRcEntitled(data);
  } catch (e) {
    console.error('auth-master-key-reset: RC fetch', e);
    return 'error';
  }
}

async function sendEmailResendMasterReset(to: string, code: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Plainsight <onboarding@resend.dev>';
  if (!apiKey) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Plainsight master key reset code',
      html: `<p>You requested access to reset your master key. Your code is <strong>${code}</strong></p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    }),
  });
  return res.ok;
}

async function resolveSessionUser(
  supabaseUrl: string,
  serviceKey: string,
  sessionToken: string,
): Promise<{ userId: string; email: string } | null> {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowIso = new Date().toISOString();
  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('id', sessionToken)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (sErr || !sess?.user_id) return null;

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', sess.user_id as string)
    .maybeSingle();

  if (uErr || !user?.id || !user?.email) return null;
  return { userId: user.id as string, email: String(user.email).trim().toLowerCase() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    console.error('auth-master-key-reset: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const sessionToken = req.headers.get('x-plainsight-session')?.trim() ?? '';
  if (!sessionToken) {
    return json({ error: 'Not signed in' }, 401);
  }

  const userRow = await resolveSessionUser(url, serviceKey, sessionToken);
  if (!userRow) {
    return json({ error: 'Invalid or expired session' }, 401);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { action?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (action === 'send') {
    const entitled = await subscriberHasSyncEntitlement(userRow.userId);
    if (entitled === 'error') {
      return json({ error: 'Could not verify subscription' }, 502);
    }
    if (!entitled) {
      return json({ error: 'not_entitled' }, 403);
    }

    const code = randomSixDigit();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from('master_key_reset_otps').insert({
      user_id: userRow.userId,
      code_hash: codeHash,
      expires_at: expiresAt,
    });

    if (insErr) {
      console.error('auth-master-key-reset: insert otp', insErr);
      return json({ error: 'Could not store code' }, 500);
    }

    const emailed = await sendEmailResendMasterReset(userRow.email, code);
    if (!emailed) {
      console.log(`auth-master-key-reset: code for ${userRow.email} (no Resend): ${code}`);
    }

    return json({ success: true });
  }

  if (action === 'verify') {
    const raw = typeof body.code === 'string' ? body.code : '';
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      return json({ error: 'Enter the 6-digit code.' }, 400);
    }

    const nowIso = new Date().toISOString();
    const { data: otpRow, error: otpErr } = await supabase
      .from('master_key_reset_otps')
      .select('id, code_hash')
      .eq('user_id', userRow.userId)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr || !otpRow?.id || !otpRow.code_hash) {
      return json({ error: 'Invalid or expired code' }, 400);
    }

    const providedHash = await sha256Hex(digits);
    if (providedHash !== otpRow.code_hash) {
      return json({ error: 'Invalid or expired code' }, 400);
    }

    const { error: useErr } = await supabase
      .from('master_key_reset_otps')
      .update({ used_at: nowIso })
      .eq('id', otpRow.id);

    if (useErr) {
      console.error('auth-master-key-reset: mark used', useErr);
      return json({ error: 'Could not verify code' }, 500);
    }

    return json({ success: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
