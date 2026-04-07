import { FunctionsHttpError, type FunctionInvokeOptions } from '@supabase/supabase-js';
import { authFunctionsSupabase } from './supabaseFunctionsClient';

function pickErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  const msg = o.message ?? o.error;
  return typeof msg === 'string' && msg.trim() ? msg : null;
}

/**
 * Invoke an Edge Function with the same auth headers as the official JS client.
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options: {
    body?: Record<string, unknown>;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
  } = {},
): Promise<{ data: T | null; error: string | null }> {
  const opts: FunctionInvokeOptions = {
    method: options.method ?? 'POST',
    headers: options.headers,
  };
  if (opts.method !== 'GET' && options.body !== undefined) {
    opts.body = options.body;
  }

  const { data, error } = await authFunctionsSupabase.functions.invoke<T>(name, opts);

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const j = await error.context.json();
        const msg = pickErrorMessage(j);
        if (msg) return { data: null, error: msg };
      } catch {
        /* ignore */
      }
    }
    return {
      data: null,
      error: typeof error.message === 'string' ? error.message : 'Request failed',
    };
  }

  return { data: data ?? null, error: null };
}
