import { useEffect, useRef } from 'react';
import { LIFETIME_SYNC_PRICE_DISPLAY } from '../constants/pricing';

export function EnableSyncModal({
  open,
  onClose,
  onUnlockSync,
  unlockDisabled = false,
  unlocking = false,
  subtitle,
}) {
  const billingRootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !unlocking) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, unlocking]);

  useEffect(() => {
    if (!open && billingRootRef.current) {
      billingRootRef.current.innerHTML = '';
    }
  }, [open]);

  if (!open) return null;

  const handleUnlock = async () => {
    if (unlockDisabled || unlocking) return;
    await onUnlockSync(billingRootRef.current);
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
        disabled={unlocking}
        onClick={() => {
          if (!unlocking) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enable-sync-title"
        className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-md flex-col rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h2
            id="enable-sync-title"
            className="text-lg font-medium text-stone-900 dark:text-stone-100"
          >
            Cloud sync
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            {subtitle?.trim() ||
              `Lifetime membership ${LIFETIME_SYNC_PRICE_DISPLAY} (one-time). Sync notes across devices and keep a cloud backup.`}
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-stone-600 dark:text-stone-300">
            <li>Sync across your devices</li>
            <li>Cloud backup for your workspaces and notes</li>
            <li>Changes update while you work</li>
          </ul>

          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            Payment details open below when you choose Pay — everything stays on this screen.
          </p>
          <div
            ref={billingRootRef}
            className="mt-3 min-h-[4rem] w-full rounded-lg border border-dashed border-stone-200 bg-stone-50/80 dark:border-stone-600 dark:bg-stone-900/40"
          />
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-stone-200 p-4 dark:border-stone-600 sm:flex-row-reverse sm:justify-end">
          <button
            type="button"
            onClick={handleUnlock}
            disabled={unlockDisabled || unlocking}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 disabled:pointer-events-none dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
          >
            {unlocking ? 'Processing…' : `Pay ${LIFETIME_SYNC_PRICE_DISPLAY}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={unlocking}
            className="px-3 py-2 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
