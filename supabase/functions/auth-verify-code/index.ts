import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const invalidCode = () =>
    new Response(JSON.stringify({ error: 'Invalid code' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      console.error('auth-verify-code: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { email?: string; code?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawEmail = typeof body.email === 'string' ? body.email : '';
    const email = rawEmail.trim().toLowerCase();
    const rawCode = typeof body.code === 'string' ? body.code : '';
    const code = rawCode.replace(/\D/g, '').slice(0, 6);

    if (!email || !email.includes('@') || code.length !== 6) {
      return invalidCode();
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (userErr || !userRow?.id) {
      return invalidCode();
    }

    const userId = userRow.id as string;
    const userEmail = userRow.email as string;

    const nowIso = new Date().toISOString();

    const { data: otpRow, error: otpSelErr } = await supabase
      .from('email_otps')
      .select('id, code_hash')
      .eq('user_id', userId)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpSelErr || !otpRow?.id || !otpRow.code_hash) {
      return invalidCode();
    }

    const providedHash = await sha256Hex(code);
    if (providedHash !== otpRow.code_hash) {
      return invalidCode();
    }

    const { error: useErr } = await supabase
      .from('email_otps')
      .update({ used_at: nowIso })
      .eq('id', otpRow.id);

    if (useErr) {
      console.error('auth-verify-code: mark used', useErr);
      return new Response(JSON.stringify({ error: 'Invalid code' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sessionToken = randomSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessErr } = await supabase.from('sessions').insert({
      id: sessionToken,
      user_id: userId,
      expires_at: expiresAt,
    });

    if (sessErr) {
      console.error('auth-verify-code: insert session', sessErr);
      return new Response(JSON.stringify({ error: 'Could not create session' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        sessionToken,
        userId,
        email: userEmail,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (e) {
    console.error('auth-verify-code:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
