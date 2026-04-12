import { useEffect, useRef } from 'react';
import { MENU_RIGHT_EDGE_SWIPE_PX } from '../constants/menuEdgeSwipe';

const SWIPE_THRESHOLD_PX = 48;
const HORIZONTAL_DOMINANCE_RATIO = 1.2;
/** Commit when finger moved at least this fraction of the pane width (or SWIPE_THRESHOLD_PX). */
const COMMIT_WIDTH_RATIO = 0.22;

/**
 * Horizontal swipe on the main notes workspace: left → next category, right → previous,
 * in the same order as {@link CategoryChips} (All, named categories, Undefined when shown).
 * Touches that begin in the right menu-edge strip are ignored so {@link useDrawerGestures} keeps working.
 *
 * When `interactive` is true (non-archive notes mode), `onPan` receives live `{ mode, tx, w }`
 * so the UI can show adjacent categories while the finger moves; otherwise only `onSelectFilter` fires on touchend.
 */
export function useCategorySwipeNavigation({
  elementRef,
  filterSequence,
  categoryFilter,
  onSelectFilter,
  isInteractionLocked,
  /** Live pan callback; pass `null` to clear. */
  onPan,
  interactive = false,
}) {
  const seqRef = useRef(filterSequence);
  const filterRef = useRef(categoryFilter);
  const onSelectRef = useRef(onSelectFilter);
  const lockedRef = useRef(isInteractionLocked);
  const onPanRef = useRef(onPan);
  const interactiveRef = useRef(interactive);

  seqRef.current = filterSequence;
  filterRef.current = categoryFilter;
  onSelectRef.current = onSelectFilter;
  lockedRef.current = isInteractionLocked;
  onPanRef.current = onPan;
  interactiveRef.current = interactive;

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let ignoreGesture = false;
    /** @type {'next' | 'prev' | null} */
    let panMode = null;
    let rafId = 0;

    const shouldIgnoreTarget = (target) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('[data-testid="category-chips-row"]')) return true;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
      return false;
    };

    const flushPan = (payload) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        onPanRef.current?.(payload);
      });
    };

    const clearPan = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      onPanRef.current?.(null);
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      if (lockedRef.current?.()) return;
      const seq = seqRef.current;
      if (!seq || seq.length < 2) return;

      const t = e.touches[0];
      if (t.clientX >= window.innerWidth - MENU_RIGHT_EDGE_SWIPE_PX) {
        ignoreGesture = true;
        tracking = false;
        return;
      }
      if (shouldIgnoreTarget(e.target)) {
        ignoreGesture = true;
        tracking = false;
        return;
      }

      ignoreGesture = false;
      tracking = true;
      panMode = null;
      startX = t.clientX;
      startY = t.clientY;
      if (interactiveRef.current) clearPan();
    };

    const onTouchMove = (e) => {
      if (!tracking || ignoreGesture || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (interactiveRef.current) {
        const w = el.clientWidth || 1;
        if (
          !panMode &&
          Math.abs(dx) > 14 &&
          Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO
        ) {
          panMode = dx < 0 ? 'next' : 'prev';
        }
        if (panMode === 'next') {
          const tx = Math.max(Math.min(dx, 0), -w);
          flushPan({ mode: 'next', tx, w });
        } else if (panMode === 'prev') {
          const tx = Math.max(Math.min(-w + dx, 0), -w);
          flushPan({ mode: 'prev', tx, w });
        }
        if (panMode && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO && Math.abs(dx) > 12) {
          e.preventDefault();
        }
        return;
      }

      if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO && Math.abs(dx) > 12) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      if (!tracking || ignoreGesture) {
        tracking = false;
        ignoreGesture = false;
        panMode = null;
        clearPan();
        return;
      }

      const t = e.changedTouches[0];
      const dx = t ? t.clientX - startX : 0;
      const dy = t ? t.clientY - startY : 0;
      tracking = false;
      ignoreGesture = false;

      const seq = seqRef.current;
      if (!seq || seq.length < 2) {
        panMode = null;
        clearPan();
        return;
      }

      let idx = seq.findIndex((f) => Object.is(f, filterRef.current));
      if (idx < 0) idx = 0;

      if (interactiveRef.current) {
        if (panMode) {
          const w = el.clientWidth || 1;
          const threshold = Math.max(SWIPE_THRESHOLD_PX, w * COMMIT_WIDTH_RATIO);
          let commit = false;
          if (panMode === 'next') commit = dx <= -threshold;
          else commit = dx >= threshold;

          const horizontal =
            Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO &&
            Math.abs(dx) >= threshold * 0.85;
          if (commit && horizontal) {
            const nextCat =
              panMode === 'next'
                ? seq[(idx + 1) % seq.length]
                : seq[(idx - 1 + seq.length) % seq.length];
            onSelectRef.current(nextCat);
          }
        }
        panMode = null;
        clearPan();
        return;
      }

      panMode = null;
      clearPan();

      const horizontal =
        Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO && Math.abs(dx) >= SWIPE_THRESHOLD_PX;
      if (!horizontal) return;

      if (dx < 0) {
        onSelectRef.current(seq[(idx + 1) % seq.length]);
      } else {
        onSelectRef.current(seq[(idx - 1 + seq.length) % seq.length]);
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      ignoreGesture = false;
      panMode = null;
      clearPan();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [elementRef]);
}
