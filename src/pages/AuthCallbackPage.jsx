import { useEffect, useState } from 'react';
import { supabaseAuthMinimal } from '../sync/supabaseAuthMinimal';

/**
 * Magic-link / OAuth redirect target.
 * Add these to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
 * - https://plainsight.vercel.app/auth/callback
 * - http://localhost:5173/auth/callback
 */

let exchangePromise = null;

function getExchangePromise() {
  if (!exchangePromise) {
    exchangePromise = (async () => {
      // Magic links use ?code=… on the full URL; avoid relying on any host rewrite
      // that drops the query string. Hash fallback is for atypical OAuth flows.
      const params = new URLSearchParams(window.location.search);
      const hash =
        window.location.hash.startsWith('#')
          ? new URLSearchParams(window.location.hash.slice(1))
          : new URLSearchParams();

      const oauthError = params.get('error') || hash.get('error');
      const oauthDesc =
        params.get('error_description') || hash.get('error_description');
      let code = params.get('code');
      if (!code) code = hash.get('code');

      if (oauthError) {
        const detail = oauthDesc
          ? decodeURIComponent(oauthDesc.replace(/\+/g, ' '))
          : oauthError;
        throw new Error(detail);
      }

      if (!code) {
        throw new Error('Missing authorization code.');
      }

      const { error } = await supabaseAuthMinimal.auth.exchangeCodeForSession(code);
      if (error) {
        throw new Error(error.message || 'Could not complete sign-in.');
      }
    })();
  }
  return exchangePromise;
}

export function AuthCallbackPage() {
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    getExchangePromise()
      .then(() => {
        window.location.replace('/');
      })
      .catch((e) => {
        const msg =
          e && typeof e.message === 'string' ? e.message : 'Sign-in failed.';
        setErrorMessage(msg);
      });
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-white dark:bg-stone-900 px-6">
      {errorMessage ? (
        <p
          className="text-sm text-center text-red-600 dark:text-red-400 max-w-sm"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Signing you in...
        </p>
      )}
    </div>
  );
}
