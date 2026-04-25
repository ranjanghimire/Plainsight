/**
 * After inserting a new bullet/checkbox line with the caret right after the marker, iOS WebKit
 * often leaves the software keyboard in lowercase. A brief blur → refocus cycle nudges the
 * keyboard toward sentence-style capitalization for the next typed character.
 */
function isLikelyIosTouchDevice() {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLTextAreaElement | null | undefined} textarea
 */
export function nudgeIosKeyboardAfterListContinuation(textarea) {
  if (!textarea || typeof document === 'undefined') return;
  if (!isLikelyIosTouchDevice()) return;
  const pos = textarea.selectionStart ?? 0;
  if (pos < 0 || pos > textarea.value.length) return;

  textarea.blur();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  });
}
