import { useEffect, useState } from 'react';
import { supabase } from '../sync/supabaseClient';

export function SignInSyncModal({ open, onClose, onSendError }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail('');
      setStep('email');
      setSending(false);
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

  const handleSendCode = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setSending(false);
    if (error) {
      onSendError?.();
      return;
    }
    setStep('sent');
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
        aria-labelledby="sign-in-sync-title"
        className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        {step === 'email' ? (
          <>
            <h2
              id="sign-in-sync-title"
              className="text-lg font-medium text-stone-900 dark:text-stone-100"
            >
              Sign in to enable sync
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Enter your email to securely sync your notes.
            </p>
            <form onSubmit={handleSendCode} className="mt-4 space-y-3">
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
              id="sign-in-sync-title"
              className="text-lg font-medium text-stone-900 dark:text-stone-100"
            >
              Check your email
            </h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              We sent you a login link. Open it on this device.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm rounded-lg bg-stone-800 text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
