import { useEffect, useState } from 'react';
import { sendCode } from '../auth/sendCode';
import { checkSyncEntitlementRemote } from '../auth/checkSyncEntitlementRemote';
import { appleReviewLogin, isAppleReviewEmail } from '../auth/appleReviewLogin';
import { EnterCodePlaceholder } from './EnterCodePlaceholder';
import { ExistingAccountBlockedDialog } from './ExistingAccountBlockedDialog';
import { shouldBlockExistingAccountSignIn } from '../utils/signInExistingAccountBlock';
import { clearAllLocalClientState } from '../utils/clearAllLocalClientState';

const shellClass =
  'relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200/90 bg-white/95 p-6 shadow-2xl ring-1 ring-stone-900/[0.04] dark:border-stone-600/80 dark:bg-stone-900/95 dark:ring-white/[0.06] sm:p-8';

export function SendCodeModal({ open, onClose, loginWithCode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [paidHint, setPaidHint] = useState(null);
  const [blockedEmail, setBlockedEmail] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail('');
      setPassword('');
      setStep('email');
      setSending(false);
      setError(null);
      setPaidHint(null);
      setBlockedEmail(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !blockedEmail) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, blockedEmail]);

  if (!open) return null;

  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setPaidHint(null);
    if (isAppleReviewEmail(trimmed)) {
      // Apple review: avoid pushing any pre-existing local data under the dev placeholder session.
      // This mirrors the "Clear this device & continue" sign-in flow so RLS won't reject first sync.
      // IMPORTANT: do not broadcast CLEAR here; that would reload this tab mid-login.
      await clearAllLocalClientState('signin_clear', { broadcast: false });
      const out = await appleReviewLogin(trimmed, password);
      setSending(false);
      if (!out.ok) {
        setError(out.error);
        return;
      }
      onClose();
      return;
    }
    const result = await sendCode(trimmed);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.accountExists && shouldBlockExistingAccountSignIn()) {
      setBlockedEmail(trimmed.toLowerCase());
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

  const handleClearDeviceAndContinue = async () => {
    const target = blockedEmail;
    if (!target) return;
    await clearAllLocalClientState('signin_clear');
    setBlockedEmail(null);
    setSending(true);
    setError(null);
    const result = await sendCode(target);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      setStep('email');
      setEmail(target);
      return;
    }
    setEmail(target);
    setStep('code');
    void (async () => {
      const entitled = await checkSyncEntitlementRemote(result.userId);
      if (entitled === true) {
        setPaidHint('This account already includes cloud sync. Enter your code to continue.');
      }
    })();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-stone-950/50 backdrop-blur-md dark:bg-black/65"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Dismiss"
          onClick={onClose}
        />
        <div className={shellClass} onClick={(ev) => ev.stopPropagation()}>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-300/90 to-transparent dark:via-stone-500/40" />
          {step === 'email' ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                    />
                  </svg>
                </div>
                <div>
                  <h2
                    id="send-code-title"
                    className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50"
                  >
                    Sign in to sync
                  </h2>
                  <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                    {isAppleReviewEmail(email)
                      ? 'Apple review account detected — signing in…'
                      : 'Email a secure one-time code — no password on this device.'}
                  </p>
                </div>
              </div>
              <form onSubmit={handleSubmitEmail} className="mt-6 space-y-4">
                <label className="block">
                  <span className="sr-only">Email</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/80 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
                    disabled={sending}
                    required
                  />
                </label>
                {isAppleReviewEmail(email) ? (
                  <label className="block">
                    <span className="sr-only">Password</span>
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      placeholder="Password"
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/80 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
                      disabled={sending}
                      required
                    />
                  </label>
                ) : null}
                {error ? (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={sending}
                    className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                  >
                    {isAppleReviewEmail(email)
                      ? sending
                        ? 'Signing in…'
                        : 'Sign in'
                      : sending
                        ? 'Sending…'
                        : 'Send code'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h2
                    id="send-code-title"
                    className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50"
                  >
                    Enter the code
                  </h2>
                  <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                    Check your inbox and spam folder.
                  </p>
                </div>
              </div>
              {paidHint ? (
                <p className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {paidHint}
                </p>
              ) : null}
              <div className="mt-5">
                <EnterCodePlaceholder
                  email={email.trim().toLowerCase()}
                  loginWithCode={loginWithCode}
                />
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ExistingAccountBlockedDialog
        open={Boolean(blockedEmail)}
        email={blockedEmail || ''}
        onUseDifferentEmail={() => {
          setBlockedEmail(null);
          setStep('email');
          setError(null);
        }}
        onClearDeviceAndContinue={handleClearDeviceAndContinue}
      />
    </>
  );
}
