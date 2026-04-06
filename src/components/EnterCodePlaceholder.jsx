import { useState } from 'react';

function normalizeOtpCode(raw) {
  return (raw || '').replace(/\D/g, '').slice(0, 6);
}

/**
 * @param {string} email
 * @param {(email: string, code: string) => Promise<{ ok: boolean; error?: string }>} loginWithCode
 */
export function EnterCodePlaceholder({ email, loginWithCode }) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    const digits = normalizeOtpCode(code);
    if (digits.length !== 6 || verifying || !loginWithCode) return;
    setVerifying(true);
    setError(null);
    const result = await loginWithCode(email, digits);
    setVerifying(false);
    if (!result.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Invalid code');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600 dark:text-stone-300">
        We sent a code to{' '}
        <span className="font-medium text-stone-800 dark:text-stone-200">{email}</span>
      </p>
      <form onSubmit={handleVerify} className="space-y-3">
        <label className="block">
          <span className="sr-only">6-digit code</span>
          <input
            type="text"
            inputMode="numeric"
            name="otp"
            autoComplete="one-time-code"
            value={code}
            onChange={(ev) => setCode(normalizeOtpCode(ev.target.value))}
            placeholder="000000"
            maxLength={6}
            disabled={verifying}
            className="w-full px-3 py-2 text-center text-xl tracking-[0.35em] font-mono rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-600"
            aria-invalid={!!error}
            aria-describedby={error ? 'otp-verify-error' : undefined}
          />
        </label>
        {error ? (
          <p id="otp-verify-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={verifying || normalizeOtpCode(code).length !== 6}
          className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
        >
          {verifying ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </div>
  );
}
