export const AUTH_DISPLAY_EMAIL_KEY = 'plainsight_auth_display_email';

/**
 * Prefer sessionStorage, then localStorage — new tabs lose sessionStorage but keep OTP
 * session in localStorage, so we still know which account the menu should show.
 */
export function readAuthDisplayEmail(): string | null {
  try {
    const s = sessionStorage.getItem(AUTH_DISPLAY_EMAIL_KEY)?.trim();
    if (s) return s;
    return localStorage.getItem(AUTH_DISPLAY_EMAIL_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function persistAuthDisplayEmail(email: string): void {
  const v = email.trim();
  if (!v) return;
  try {
    sessionStorage.setItem(AUTH_DISPLAY_EMAIL_KEY, v);
    localStorage.setItem(AUTH_DISPLAY_EMAIL_KEY, v);
  } catch {
    /* ignore */
  }
}

export function clearAuthDisplayEmailStorage(): void {
  try {
    sessionStorage.removeItem(AUTH_DISPLAY_EMAIL_KEY);
    localStorage.removeItem(AUTH_DISPLAY_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}
