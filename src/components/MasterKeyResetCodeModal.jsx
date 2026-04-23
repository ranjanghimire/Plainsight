import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { verifyMasterKeyResetCode } from '../auth/masterKeyReset';

function readVisualViewportFrame() {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    top: vv.offsetTop,
    left: vv.offsetLeft,
    width: vv.width,
    height: vv.height,
  };
}

/** Pin overlay to the visual viewport so centered modals stay above the iOS keyboard. */
function useVisualViewportModalFrame(isOpen) {
  const [frame, setFrame] = useState(readVisualViewportFrame);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    const apply = () => setFrame(readVisualViewportFrame());

    apply();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
    }
    window.addEventListener('resize', apply);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
      }
      window.removeEventListener('resize', apply);
    };
  }, [isOpen]);

  return frame;
}

export function MasterKeyResetCodeModal({ open, onClose, authEmail, onVerified }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const vvFrame = useVisualViewportModalFrame(open);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setCode('');
      setBusy(false);
      setError(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open || typeof document === 'undefined') return null;

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const digits = code.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await verifyMasterKeyResetCode(digits);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onVerified();
    onClose();
  };

  return createPortal(
    <div
      className="fixed z-[115] flex min-h-0 items-center justify-center overflow-y-auto overscroll-contain bg-stone-900/50 p-4 dark:bg-black/60"
      style={{
        top: vvFrame.top,
        left: vvFrame.left,
        width: vvFrame.width,
        height: vvFrame.height,
      }}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 min-h-full min-w-full cursor-default"
        aria-label="Dismiss"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mk-reset-code-title"
        className="relative z-10 my-auto w-full max-h-[min(100%,32rem)] max-w-sm overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2
          id="mk-reset-code-title"
          className="text-base font-medium text-stone-900 dark:text-stone-100"
        >
          Enter reset code
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-stone-800 dark:text-stone-200">{authEmail}</span>.
          Enter it below, then you can reset your master key on the next screen.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              disabled={busy}
              className="w-full px-3 py-2 text-center text-2xl tracking-[0.35em] font-mono rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-600"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
