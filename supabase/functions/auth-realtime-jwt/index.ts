/**
 * Mint a short-lived HS256 JWT for Supabase Realtime private channels.
 *
 * Deploy, then set the project JWT secret (Dashboard → Settings → API → JWT Secret):
 *   supabase secrets set PLAINSIGHT_REALTIME_JWT_SECRET="<paste JWT secret>"
 *
 * Client calls with header `x-plainsight-session` (same as auth-session-user).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { SignJWT } from 'https://esm.sh/jose@5.9.6';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plainsight-session',
};

const REALTIME_JWT_TTL_SEC = 3600;

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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const jwtSecret =
    Deno.env.get('PLAINSIGHT_REALTIME_JWT_SECRET')?.trim() ||
    Deno.env.get('SUPABASE_JWT_SECRET')?.trim() ||
    '';

  if (!url || !anonKey) {
    console.error('auth-realtime-jwt: missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  if (!jwtSecret) {
    console.error('auth-realtime-jwt: set PLAINSIGHT_REALTIME_JWT_SECRET to your project JWT secret');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const sessionToken = req.headers.get('x-plainsight-session')?.trim() ?? '';
  if (!sessionToken) {
    return json({ error: 'Missing session' }, 401);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { 'x-plainsight-session': sessionToken },
    },
  });

  const nowIso = new Date().toISOString();

  const { data: sess, error: sErr } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('id', sessionToken)
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (sErr || !sess?.user_id) {
    return json({ error: 'Invalid or expired session' }, 401);
  }

  const userId = sess.user_id as string;

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();

  if (uErr || !user?.id) {
    return json({ error: 'User not found' }, 401);
  }

  const email = typeof user.email === 'string' ? user.email : '';

  const issuer = `${url.replace(/\/$/, '')}/auth/v1`;
  const secretKey = new TextEncoder().encode(jwtSecret);

  const realtimeJwt = await new SignJWT({
    role: 'authenticated',
    email,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id as string)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setExpirationTime(`${REALTIME_JWT_TTL_SEC}s`)
    .sign(secretKey);

  return json({
    realtimeJwt,
    expiresInSec: REALTIME_JWT_TTL_SEC,
  });
});
