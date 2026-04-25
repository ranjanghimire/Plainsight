import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    console.error('auth-apple-review-login: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const reviewEmailEnv = (Deno.env.get('APPLE_REVIEW_EMAIL') ?? 'apple-review@plainsight.app')
    .trim()
    .toLowerCase();
  const reviewPasswordEnv = (Deno.env.get('APPLE_REVIEW_PASSWORD') ?? '').trim();
  if (!reviewPasswordEnv) {
    console.error('auth-apple-review-login: missing APPLE_REVIEW_PASSWORD');
    return json({ error: 'Server misconfigured' }, 500);
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
  const password = (typeof body.password === 'string' ? body.password : '').trim();

  if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);
  if (email !== reviewEmailEnv) return json({ error: 'Invalid credentials' }, 401);
  if (password !== reviewPasswordEnv) return json({ error: 'Invalid credentials' }, 401);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ensure a row exists in public.users for this email (the app uses custom tables, not GoTrue users).
  const { data: userRow, error: selErr } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  let userId: string | null = userRow?.id ? String(userRow.id) : null;
  if (selErr) {
    console.error('auth-apple-review-login: select user', selErr);
    return json({ error: 'Database error' }, 500);
  }

  if (!userId) {
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert({ email })
      .select('id, email')
      .single();

    if (insErr || !inserted?.id) {
      console.error('auth-apple-review-login: insert user', insErr);
      return json({ error: 'Could not create user' }, 500);
    }
    userId = String(inserted.id);
  }

  const sessionToken = randomSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: sessErr } = await supabase.from('sessions').insert({
    id: sessionToken,
    user_id: userId,
    expires_at: expiresAt,
  });

  if (sessErr) {
    console.error('auth-apple-review-login: insert session', sessErr);
    return json({ error: 'Could not create session' }, 500);
  }

  return json({ sessionToken, userId, email });
});

