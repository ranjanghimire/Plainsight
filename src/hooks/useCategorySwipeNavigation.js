import { useEffect, useRef } from 'react';
import { MENU_RIGHT_EDGE_SWIPE_PX } from '../constants/menuEdgeSwipe';

const SWIPE_THRESHOLD_PX = 48;
const HORIZONTAL_DOMINANCE_RATIO = 1.2;

/**
 * Horizontal swipe on the main notes workspace: left → next category, right → previous,
 * in the same order as {@link CategoryChips} (All, named categories, Undefined when shown).
 * Touches that begin in the right menu-edge strip are ignored so {@link useDrawerGestures} keeps working.
 */
export function useCategorySwipeNavigation({
  elementRef,
  filterSequence,
  categoryFilter,
  onSelectFilter,
  isInteractionLocked,
}) {
  const seqRef = useRef(filterSequence);
  const filterRef = useRef(categoryFilter);
  const onSelectRef = useRef(onSelectFilter);
  const lockedRef = useRef(isInteractionLocked);

  seqRef.current = filterSequence;
  filterRef.current = categoryFilter;
  onSelectRef.current = onSelectFilter;
  lockedRef.current = isInteractionLocked;

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let ignoreGesture = false;

    const shouldIgnoreTarget = (target) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('[data-testid="category-chips-row"]')) return true;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
      return false;
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
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e) => {
      if (!tracking || ignoreGesture || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO && Math.abs(dx) > 12) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      if (!tracking || ignoreGesture) {
        tracking = false;
        ignoreGesture = false;
        return;
      }
      tracking = false;
      ignoreGesture = false;

      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const horizontal =
        Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO && Math.abs(dx) >= SWIPE_THRESHOLD_PX;
      if (!horizontal) return;

      const seq = seqRef.current;
      if (!seq || seq.length < 2) return;

      let idx = seq.findIndex((f) => Object.is(f, filterRef.current));
      if (idx < 0) idx = 0;

      if (dx < 0) {
        const next = seq[(idx + 1) % seq.length];
        onSelectRef.current(next);
      } else {
        const next = seq[(idx - 1 + seq.length) % seq.length];
        onSelectRef.current(next);
      }
    };

    const onTouchCancel = () => {
      tracking = false;
      ignoreGesture = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [elementRef]);
}
