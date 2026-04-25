import { useEffect, useState } from 'react';

const CONFIRM_PHRASE = 'SIGN OUT';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onCancel
 * @param {() => void | Promise<void>} props.onConfirm
 */
export function SignOutDataLossDialog({ open, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setTyped('');
      setBusy(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, busy]);

  if (!open) return null;

  const phraseOk = typed.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleConfirm = async () => {
    if (!phraseOk || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-stone-950/55 backdrop-blur-md dark:bg-black/70"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-data-loss-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200/90 bg-white/95 shadow-2xl ring-1 ring-stone-900/[0.04] dark:border-stone-600/80 dark:bg-stone-900/95 dark:ring-white/[0.06]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent dark:via-amber-500/40" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
              aria-hidden
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25V9M12 12v9m-6-3h12a2.25 2.25 0 002.25-2.25V9.75A2.25 2.25 0 0019.5 7.5h-15A2.25 2.25 0 002.25 9.75v2.25A2.25 2.25 0 004.5 15z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="sign-out-data-loss-title"
                className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50"
              >
                Remove data from this device?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                When you sign out, this device removes its local workspaces. Your synced work will come back
                the next time you sign in.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-stone-600 dark:text-stone-400">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/90" aria-hidden />
                  <span>Unsynced edits stay only on this device and won&apos;t return after sign-out</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400 dark:bg-stone-500" aria-hidden />
                  <span>Your theme and device preferences remain unchanged.</span>
                </li>
              </ul>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Type <span className="font-mono text-stone-800 dark:text-stone-200">{CONFIRM_PHRASE}</span> to
              continue
            </span>
            <input
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/80 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
              placeholder={CONFIRM_PHRASE}
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Stay signed in
            </button>
            <button
              type="button"
              disabled={!phraseOk || busy}
              onClick={handleConfirm}
              className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              {busy ? 'Signing out…' : 'Sign out & wipe device'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
