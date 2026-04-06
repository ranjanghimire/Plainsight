import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plainsight-session',
};

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
  if (!url || !anonKey) {
    console.error('auth-session-user: missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const sessionToken = req.headers.get('x-plainsight-session')?.trim() ?? '';
  if (!sessionToken) {
    return json({ loggedIn: false });
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
    return json({ loggedIn: false });
  }

  const userId = sess.user_id as string;

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();

  if (uErr || !user?.email) {
    return json({ loggedIn: false });
  }

  return json({
    loggedIn: true,
    userId: user.id as string,
    email: user.email as string,
  });
});
