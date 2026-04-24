import { useEffect, useState } from 'react';
import { sendCode } from '../auth/sendCode';
import { checkSyncEntitlementRemote } from '../auth/checkSyncEntitlementRemote';
import { EnterCodePlaceholder } from './EnterCodePlaceholder';
import { isOAuthSignInConfigured } from '../auth/oauthBrowserSupabase';

function GoogleGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83z" />
      <path d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(email: string, code: string) => Promise<{ ok: boolean; error?: string }>} props.loginWithCode
 * @param {(provider: 'google' | 'apple') => Promise<{ ok: boolean; error?: string }>} props.startOAuthSignIn
 */
export function SendCodeModal({ open, onClose, loginWithCode, startOAuthSignIn }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState(null);
  const [paidHint, setPaidHint] = useState(null);
  const oauthAvailable = isOAuthSignInConfigured();

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail('');
      setStep('email');
      setSending(false);
      setOauthBusy(false);
      setError(null);
      setPaidHint(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setPaidHint(null);
    const result = await sendCode(trimmed);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep('code');
    void (async () => {
      const entitled = await checkSyncEntitlementRemote(result.userId);
      if (entitled === true) {
        setPaidHint('This account already includes cloud sync. Enter your code to continue.');
      }
    })();
  };

  const runOAuth = async (provider) => {
    setOauthBusy(true);
    setError(null);
    try {
      const r = await startOAuthSignIn(provider);
      if (!r.ok) {
        setError(r.error || 'Could not start sign-in.');
      }
    } finally {
      setOauthBusy(false);
    }
  };

  const busy = sending || oauthBusy;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-950/55 backdrop-blur-[2px] dark:bg-black/65"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-code-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_24px_80px_-12px_rgba(28,25,23,0.25)] ring-1 ring-stone-900/[0.04] dark:border-stone-600/90 dark:bg-stone-800 dark:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300/80 to-transparent dark:via-stone-500/50" />
        <div className="px-6 pb-6 pt-6 sm:px-7 sm:pb-7 sm:pt-7">
          {step === 'email' ? (
            <>
              <h2
                id="send-code-title"
                className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
              >
                Sign in to sync
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                Use your email for a one-time code, or continue with Google or Apple. Same email always maps to the
                same account.
              </p>

              <form onSubmit={handleSubmitEmail} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-2.5 text-base text-stone-900 shadow-inner shadow-stone-900/[0.03] placeholder:text-stone-400 transition-[border-color,box-shadow] focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/35 dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500 dark:focus:ring-stone-500/30"
                    disabled={busy}
                    required
                  />
                </label>
                {error ? (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse sm:justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white sm:flex-none"
                  >
                    {sending ? 'Sending…' : 'Send code'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700/80"
                  >
                    Cancel
                  </button>
                </div>
              </form>

              {oauthAvailable ? (
                <>
                  <div className="relative my-7" aria-hidden="false">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stone-200 dark:border-stone-600/80" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                        Or
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runOAuth('google')}
                      className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900/40 dark:text-stone-100 dark:hover:border-stone-500 dark:hover:bg-stone-900"
                    >
                      <GoogleGlyph className="h-5 w-5 shrink-0" />
                      Sign in with Google
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runOAuth('apple')}
                      className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-900 bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                    >
                      <AppleGlyph className="h-5 w-5 shrink-0 text-white dark:text-stone-900" />
                      Sign in with Apple
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <h2
                id="send-code-title"
                className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
              >
                Enter the code
              </h2>
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                We sent a 6-digit code to <span className="font-medium text-stone-800 dark:text-stone-200">{email.trim()}</span>.
              </p>
              {paidHint ? (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {paidHint}
                </p>
              ) : null}
              <div className="mt-5">
                <EnterCodePlaceholder email={email.trim().toLowerCase()} loginWithCode={loginWithCode} />
              </div>
              <div className="mt-8 flex justify-end border-t border-stone-100 pt-5 dark:border-stone-700/80">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700/80"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
