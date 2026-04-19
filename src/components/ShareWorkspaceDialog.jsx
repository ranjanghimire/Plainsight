import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function isEmailValid(v) {
  const email = normalizeEmail(v);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ShareWorkspaceDialog({
  open,
  workspaceName,
  busy = false,
  initialEmail = '',
  onClose,
  onSubmit,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail || '');
    setTouched(false);
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const valid = isEmailValid(email);
  const canSubmit = valid && !busy;
  const normalized = normalizeEmail(email);
  const name = String(workspaceName || '').trim() || 'Workspace';

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/60"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${name}`}
        className="relative z-10 w-full max-w-sm rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
          Share workspace
        </h2>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Invite someone to collaborate on <span className="font-medium">{name}</span>.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault();
              void onSubmit(normalized);
            }
          }}
          disabled={busy}
          placeholder="recipient@email.com"
          className="mt-4 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:ring-stone-600"
          autoFocus
        />
        {!valid && touched ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Enter a valid email address.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSubmit(normalized)}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
