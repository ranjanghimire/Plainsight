import { useEffect, useId } from 'react';
import { LIFETIME_SYNC_PRICE_DISPLAY } from '../constants/pricing';

/** Premium abstract mark: gradient orbit + three nodes (connected continuity, not a cloud). */
function PremiumSyncMark({ className }) {
  const rawId = useId();
  const gid = `sync-mark-${rawId.replace(/:/g, '')}`;

  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${gid}-stroke`} x1="8" y1="10" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#93c5fd" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id={`${gid}-fill`} x1="16" y1="12" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0f9ff" />
          <stop offset="1" stopColor="#c7d2fe" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="19" stroke={`url(#${gid}-stroke)`} strokeOpacity="0.2" strokeWidth="1" />
      <ellipse
        cx="24"
        cy="24"
        rx="13"
        ry="8.5"
        stroke={`url(#${gid}-stroke)`}
        strokeWidth="1.25"
        transform="rotate(-18 24 24)"
      />
      <circle cx="24" cy="14" r="2.4" fill={`url(#${gid}-fill)`} />
      <circle cx="15" cy="31" r="2" fill={`url(#${gid}-fill)`} />
      <circle cx="33" cy="31" r="2" fill={`url(#${gid}-fill)`} />
    </svg>
  );
}

export function EnableSyncModal({
  open,
  onClose,
  onUnlockSync,
  unlockDisabled = false,
  unlocking = false,
  subtitle,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !unlocking) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, unlocking]);

  if (!open) return null;

  const handleUnlock = async () => {
    if (unlockDisabled || unlocking) return;
    await onUnlockSync();
  };

  const subline =
    subtitle?.trim() ||
    `One-time payment of ${LIFETIME_SYNC_PRICE_DISPLAY}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
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
        className="relative z-10 w-full max-w-[20rem] shrink-0 rounded-2xl border border-white/10 bg-[#1C1C1E] shadow-2xl shadow-black/50"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="px-5 pb-6 pt-7">
          <div className="mb-4 flex justify-center">
            <PremiumSyncMark className="h-12 w-12" />
          </div>

          <h2
            id="enable-sync-title"
            className="text-center text-[1.0625rem] font-semibold leading-snug tracking-tight text-white"
          >
            Sync across devices
          </h2>
          <p className="mt-1.5 text-center text-sm font-medium text-stone-400">{subline}</p>

          <div className="my-5 h-px w-full bg-white/[0.08]" aria-hidden />

          <ul className="space-y-2 text-stone-100">
            {[
              'Sync across your devices',
              'Cloud backup for your workspaces and notes',
              'Changes update while you work',
            ].map((line) => (
              <li
                key={line}
                className="relative pl-4 text-left text-[0.8125rem] font-normal leading-relaxed"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[1px] top-[0.5lh] size-1 -translate-y-1/2 rounded-full bg-white text-[0.8125rem] leading-relaxed opacity-70"
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col items-stretch gap-2.5">
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlockDisabled || unlocking}
              className="w-full rounded-full bg-white py-3 text-center text-[0.9375rem] font-semibold text-black transition hover:bg-stone-100 disabled:pointer-events-none disabled:opacity-45"
            >
              {unlocking
                ? 'Processing…'
                : `Unlock Sync for ${LIFETIME_SYNC_PRICE_DISPLAY}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={unlocking}
              className="py-1.5 text-center text-sm font-medium text-stone-500 transition hover:text-stone-400 disabled:opacity-45"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
