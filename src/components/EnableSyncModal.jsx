import { useEffect, useState } from 'react';

export function EnableSyncModal({ open, onClose, onSubmit, initialEmail = '' }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setEmail(initialEmail);
      setError('');
      setSubmitting(false);
      setSubmitted(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await onSubmit(email);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
    window.setTimeout(() => onClose(), 400);
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
        aria-labelledby="enable-sync-title"
        className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2
          id="enable-sync-title"
          className="text-lg font-medium text-stone-900 dark:text-stone-100"
        >
          Enable Sync
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          We&apos;ll send a verification link to your email. Your notes stay on this account.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
              disabled={submitting}
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {submitted ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Check your email to continue.
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-sm rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-60 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
            >
              {submitting ? 'Sending…' : 'Send verification link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
