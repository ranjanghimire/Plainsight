import { useEffect } from 'react';

export function EnableCloudSyncModal({ open, onClose, onEnable }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

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
        aria-labelledby="enable-cloud-sync-title"
        className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2
          id="enable-cloud-sync-title"
          className="text-lg font-medium text-stone-900 dark:text-stone-100"
        >
          Enable Cloud Sync
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Upload your notes and keep them synced across devices.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
          <button
            type="button"
            onClick={() => {
              onEnable();
            }}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-stone-800 text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
          >
            Enable Sync
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
