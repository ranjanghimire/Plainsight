import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth-only Supabase client: same URL/key/storage as {@link ./supabaseClient.ts}
 * but without pulling in sync gating or fetch helpers. Used by /auth/callback only.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseAuthMinimal: SupabaseClient = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
);
