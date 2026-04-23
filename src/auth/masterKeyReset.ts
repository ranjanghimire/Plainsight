import { getSession } from './localSession';
import { invokeEdgeFunction } from './functionsInvoke';

export async function sendMasterKeyResetEmail(): Promise<
  { ok: true } | { ok: false; error: string; notEntitled?: boolean }
> {
  const token = getSession().sessionToken?.trim();
  if (!token) {
    return { ok: false, error: 'Sign in with your email to use this command.' };
  }

  const { data, error } = await invokeEdgeFunction<{
    success?: boolean;
    error?: string;
  }>('auth-master-key-reset', {
    body: { action: 'send' },
    headers: { 'x-plainsight-session': token },
  });

  if (error) {
    if (error === 'not_entitled' || error.includes('not_entitled')) {
      return { ok: false, error: 'This feature requires cloud sync.', notEntitled: true };
    }
    return { ok: false, error };
  }

  if (!data || data.success !== true) {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  return { ok: true };
}

export async function verifyMasterKeyResetCode(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getSession().sessionToken?.trim();
  if (!token) {
    return { ok: false, error: 'Session expired. Sign in again.' };
  }

  const digits = (code || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length !== 6) {
    return { ok: false, error: 'Enter the 6-digit code.' };
  }

  const { data, error } = await invokeEdgeFunction<{
    success?: boolean;
    error?: string;
  }>('auth-master-key-reset', {
    body: { action: 'verify', code: digits },
    headers: { 'x-plainsight-session': token },
  });

  if (error) {
    return { ok: false, error };
  }

  if (!data || data.success !== true) {
    return { ok: false, error: 'Unexpected response from server.' };
  }

  return { ok: true };
}
