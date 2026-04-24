import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { firstWordsNotePreview } from '../utils/activityLogPreview';

function normalizeLogDetails(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

function activityLogNoteSnippet(log) {
  const d = normalizeLogDetails(log.details);
  if (typeof d.preview === 'string' && d.preview.trim()) return d.preview.trim();
  if (typeof d.text === 'string' && d.text.trim()) return firstWordsNotePreview(d.text);
  return '';
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

export function WorkspaceActivityLogDialog({
  open,
  workspaceName,
  workspaceId,
  fetchLogs,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!open || !workspaceId) return undefined;
    let cancelled = false;
    setBusy(true);
    setError('');
    (async () => {
      const res = await fetchLogs(workspaceId, 120);
      if (cancelled) return;
      if (res?.error) {
        setError(String(res.error.message || 'Could not load logs'));
        setLogs([]);
      } else {
        setLogs(Array.isArray(res?.data) ? res.data : []);
      }
      setBusy(false);
    })().catch((e) => {
      if (cancelled) return;
      setError(String(e?.message || 'Could not load logs'));
      setLogs([]);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, fetchLogs]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const title = useMemo(() => {
    const name = String(workspaceName || '').trim() || 'Shared workspace';
    return `${name} logs`;
  }, [workspaceName]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/60"
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
        aria-label={title}
        className="relative z-10 w-full max-w-xl rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
            aria-label="Close logs dialog"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {busy ? (
          <p className="py-6 text-sm text-stone-500 dark:text-stone-400">Loading logs…</p>
        ) : error ? (
          <p className="py-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : logs.length === 0 ? (
          <p className="py-6 text-sm text-stone-500 dark:text-stone-400">
            No activity yet.
          </p>
        ) : (
          <div className="max-h-[min(62vh,34rem)] space-y-2 overflow-y-auto pr-1">
            {logs.map((l) => {
              const snippet = activityLogNoteSnippet(l);
              return (
              <div
                key={l.id}
                className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-stone-600 dark:bg-stone-900"
              >
                <p className="text-sm text-stone-800 dark:text-stone-200">{l.summary}</p>
                {snippet ? (
                  <p className="mt-1 text-xs leading-snug text-stone-500 line-clamp-2 dark:text-stone-400">
                    <span className="text-stone-400 dark:text-stone-500">Note: </span>
                    {snippet}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                  <span>{l.actor_email || 'Unknown user'}</span>
                  <span aria-hidden>•</span>
                  <span>{formatWhen(l.created_at)}</span>
                  {l.action ? (
                    <>
                      <span aria-hidden>•</span>
                      <span className="font-mono">{l.action}</span>
                    </>
                  ) : null}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
