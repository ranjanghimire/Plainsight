import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Supabase OAuth PKCE redirect target. Exchanges `?code=` for a GoTrue session, then
 * `finalizeOAuthRedirect` maps that into Plainsight `sessions` + localStorage session.
 */
export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { finalizeOAuthRedirect } = useAuth();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const result = await finalizeOAuthRedirect();
        navigate('/', {
          replace: true,
          state: result.ok ? {} : { oauthError: result.error || 'Sign-in failed.' },
        });
      } catch (e) {
        navigate('/', {
          replace: true,
          state: { oauthError: e instanceof Error ? e.message : 'Sign-in failed.' },
        });
      }
    })();
  }, [finalizeOAuthRedirect, navigate]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-stone-200 border-t-stone-600 dark:border-stone-600 dark:border-t-stone-200"
        aria-hidden
      />
      <p className="text-sm font-medium text-stone-600 dark:text-stone-300">Completing sign-in…</p>
      <p className="max-w-xs text-xs text-stone-400 dark:text-stone-500">Securely connecting your account.</p>
    </div>
  );
}
