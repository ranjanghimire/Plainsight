import { useEffect, useState } from 'react';
import { supabase } from '../sync/supabaseClient';

function normalizeOtpCode(raw) {
  return (raw || '').replace(/\D/g, '').slice(0, 6);
}

export function SignInSyncModal({ open, onClose }) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email');
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [sendError, setSendError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail('');
      setStep('email');
      setOtpCode('');
      setSending(false);
      setVerifying(false);
      setVerifyError(null);
      setSendError(null);
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

  const trimmedEmail = email.trim();

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!trimmedEmail || sending) return;
    setSending(true);
    setVerifyError(null);
    setSendError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    setSending(false);
    if (error) {
      setSendError(error.message || 'Could not send code. Try again.');
      return;
    }
    setStep('code');
    setOtpCode('');
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const token = normalizeOtpCode(otpCode);
    if (token.length !== 6 || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token,
      type: 'email',
    });
    setVerifying(false);
    if (error) {
      setVerifyError(error.message || 'Invalid code. Try again.');
      return;
    }
    onClose();
  };

  const goBackToEmail = () => {
    setStep('email');
    setOtpCode('');
    setVerifyError(null);
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
              Enter your email. We&apos;ll send a 6-digit code.
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
              {sendError ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {sendError}
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
              id="sign-in-sync-title"
              className="text-lg font-medium text-stone-900 dark:text-stone-100"
            >
              Enter the 6-digit code
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Sent to <span className="font-medium text-stone-700 dark:text-stone-300">{trimmedEmail}</span>
            </p>
            <form onSubmit={handleVerifyOtp} className="mt-4 space-y-3">
              <label className="block">
                <span className="sr-only">One-time code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  name="otp"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(ev) => setOtpCode(normalizeOtpCode(ev.target.value))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-3 py-2 text-center text-xl tracking-[0.35em] font-mono rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-600"
                  disabled={verifying}
                  required
                  aria-invalid={!!verifyError}
                  aria-describedby={verifyError ? 'otp-error' : undefined}
                />
              </label>
              {verifyError ? (
                <p id="otp-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {verifyError}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end pt-1">
                <button
                  type="submit"
                  disabled={verifying || normalizeOtpCode(otpCode).length !== 6}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
                >
                  {verifying ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={goBackToEmail}
                  disabled={verifying}
                  className="px-3 py-2 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  Use different email
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
