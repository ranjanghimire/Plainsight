import { useEffect, useState } from 'react';
import { sendCode } from '../auth/sendCode';
import { checkSyncEntitlementRemote } from '../auth/checkSyncEntitlementRemote';
import { EnterCodePlaceholder } from './EnterCodePlaceholder';

export function SendCodeModal({ open, onClose, loginWithCode }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [paidHint, setPaidHint] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail('');
      setStep('email');
      setSending(false);
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/60"
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
        className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        {step === 'email' ? (
          <>
            <h2
              id="send-code-title"
              className="text-lg font-medium text-stone-900 dark:text-stone-100"
            >
              Sign in to sync
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Enter your email. We&apos;ll send a 6-digit code.
            </p>
            <form onSubmit={handleSubmitEmail} className="mt-4 space-y-3">
              <label className="block">
                <span className="sr-only">Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-base rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500"
                  disabled={sending}
                  required
                />
              </label>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end pt-1">
                <button
                  type="submit"
                  disabled={sending}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
                >
                  {sending ? 'Sending…' : 'Send code'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="px-3 py-2 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2
              id="send-code-title"
              className="text-lg font-medium text-stone-900 dark:text-stone-100"
            >
              Enter the code
            </h2>
            {paidHint ? (
              <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{paidHint}</p>
            ) : null}
            <div className="mt-4">
              <EnterCodePlaceholder
                email={email.trim().toLowerCase()}
                loginWithCode={loginWithCode}
              />
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
