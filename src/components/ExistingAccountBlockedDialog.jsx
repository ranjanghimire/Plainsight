import { useEffect, useState } from 'react';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.email
 * @param {() => void} props.onUseDifferentEmail
 * @param {() => void | Promise<void>} props.onClearDeviceAndContinue
 */
export function ExistingAccountBlockedDialog({
  open,
  email,
  onUseDifferentEmail,
  onClearDeviceAndContinue,
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => setBusy(false), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onUseDifferentEmail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onUseDifferentEmail, busy]);

  if (!open) return null;

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onClearDeviceAndContinue();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6 bg-stone-950/50 backdrop-blur-md dark:bg-black/65"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (!busy) onUseDifferentEmail();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="existing-account-block-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200/90 bg-white/95 shadow-2xl ring-1 ring-stone-900/[0.04] dark:border-stone-600/80 dark:bg-stone-900/95 dark:ring-white/[0.06]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/90 to-transparent dark:via-sky-500/35" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
              aria-hidden
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="existing-account-block-title"
                className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50"
              >
                This account already exists in the cloud
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                You have local workspaces on this device. Plainsight does not merge them with an existing
                account. Use a <span className="font-medium text-stone-800 dark:text-stone-100">different email</span>{' '}
                for this device, or clear this device first and then sign in — your server data will download
                again.
              </p>
              <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs font-medium text-stone-600 dark:bg-stone-800/80 dark:text-stone-300">
                <span className="text-stone-500 dark:text-stone-400">Signing in as </span>
                <span className="break-all text-stone-900 dark:text-stone-100">{email}</span>
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onUseDifferentEmail}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Use different email
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleClear}
              className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              {busy ? 'Clearing device…' : 'Clear this device & continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
