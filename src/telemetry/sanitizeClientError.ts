/** UUID v4-ish (loose) for redaction in stacks and messages. */
const UUID_LIKE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /\b[^\s@]{1,80}@[^\s@]{1,80}\.[^\s@]{2,20}\b/gi;
const LONG_QUOTED = /"[^"\n]{48,}"/g;
const LONG_SQUOTED = /'[^'\n]{48,}'/g;
const BEARER = /\bBearer\s+[\w-._+/=]{20,}/gi;
const TOKEN_PARAM = /([?&]token=)[^&\s]+/gi;
const SESSION_HEADER = /x-plainsight-session['":\s=]+[\w-._+/=]{12,}/gi;
const HEX_RUN = /\b[0-9a-f]{32,}\b/gi;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Strip obvious PII / secrets and cap length. Intended for error messages and stack lines.
 */
export function sanitizeTelemetryText(input: string, maxLen: number): string {
  if (!input) return '';
  let s = String(input).slice(0, Math.min(maxLen * 4, 32_000));
  s = s.replace(EMAIL, '[email]');
  s = s.replace(UUID_LIKE, '[uuid]');
  s = s.replace(BEARER, 'Bearer [redacted]');
  s = s.replace(TOKEN_PARAM, '$1[redacted]');
  s = s.replace(SESSION_HEADER, 'x-plainsight-session=[redacted]');
  s = s.replace(HEX_RUN, '[hex]');
  s = s.replace(LONG_QUOTED, '"[long]"');
  s = s.replace(LONG_SQUOTED, "'[long]'");
  s = collapseWhitespace(s).slice(0, maxLen);
  return s;
}

const URL_FILE = /\b(?:https?:\/\/|file:\/\/)[^\s)]+/gi;

/** Keep stack shape but drop query strings and long URLs. */
export function compressStack(stack: string | undefined | null, maxLines: number): string {
  if (!stack) return '';
  const lines = String(stack)
    .split('\n')
    .slice(0, Math.max(1, maxLines))
    .map((line) => {
      let l = line.replace(URL_FILE, (u) => {
        try {
          const noQuery = u.split('?')[0];
          return noQuery.length > 160 ? `${noQuery.slice(0, 120)}…` : noQuery;
        } catch {
          return '[url]';
        }
      });
      l = sanitizeTelemetryText(l, 400);
      return l;
    });
  return lines.join('\n').slice(0, 24_000);
}

export function telemetryFingerprint(type: string, message: string): string {
  return `${type}|${message.slice(0, 160)}`;
}

export function safeRoutePath(): string | null {
  if (typeof window === 'undefined' || !window.location?.pathname) return null;
  const p = window.location.pathname;
  return sanitizeTelemetryText(p, 400) || null;
}
