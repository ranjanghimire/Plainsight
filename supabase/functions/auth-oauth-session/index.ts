import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    console.error('auth-oauth-session: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  let body: { access_token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  if (!accessToken) {
    return json({ error: 'Missing access token.' }, 400);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(accessToken);

  if (userErr || !user?.email) {
    console.error('auth-oauth-session: getUser', userErr);
    return json({ error: 'Invalid or expired sign-in. Try again.' }, 401);
  }

  const email = String(user.email).trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return json({ error: 'Your account has no usable email for sync.' }, 400);
  }

  try {
    const { data: existing, error: selErr } = await admin
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (selErr) {
      console.error('auth-oauth-session: select user', selErr);
      return json({ error: 'Database error' }, 500);
    }

    let userId: string;
    if (existing?.id) {
      userId = existing.id as string;
    } else {
      const { data: inserted, error: insErr } = await admin.from('users').insert({ email }).select('id').single();

      if (insErr) {
        if (String(insErr.code || '') === '23505') {
          const { data: retry, error: rErr } = await admin
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
          if (rErr || !retry?.id) {
            console.error('auth-oauth-session: race insert', rErr);
            return json({ error: 'Could not resolve account' }, 500);
          }
          userId = retry.id as string;
        } else {
          console.error('auth-oauth-session: insert user', insErr);
          return json({ error: 'Could not create account' }, 500);
        }
      } else {
        userId = inserted!.id as string;
      }
    }

    const sessionToken = randomSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessErr } = await admin.from('sessions').insert({
      id: sessionToken,
      user_id: userId,
      expires_at: expiresAt,
    });

    if (sessErr) {
      console.error('auth-oauth-session: insert session', sessErr);
      return json({ error: 'Could not create session' }, 500);
    }

    const { data: userRow } = await admin.from('users').select('email').eq('id', userId).maybeSingle();
    const outEmail = (userRow?.email as string | undefined) || email;

    return json({
      sessionToken,
      userId,
      email: outEmail,
    });
  } catch (e) {
    console.error('auth-oauth-session:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
