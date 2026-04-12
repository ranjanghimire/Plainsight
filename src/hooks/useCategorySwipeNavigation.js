import { useEffect, useRef } from 'react';
import { MENU_RIGHT_EDGE_SWIPE_PX } from '../constants/menuEdgeSwipe';

const SWIPE_THRESHOLD_PX = 48;
const HORIZONTAL_DOMINANCE_RATIO = 1.2;
/** Commit when finger moved at least this fraction of the pane width (or SWIPE_THRESHOLD_PX). */
const COMMIT_WIDTH_RATIO = 0.18;

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
    /** Identifier of the touch we're tracking (document-level listeners survive subtree remounts). */
    let activeTouchId = -1;
    /** @type {'next' | 'prev' | null} */
    let panMode = null;
    let rafId = 0;
    /** Bumps on touchstart / touchend so RAFs from touchmove cannot apply pan after the gesture ended. */
    let panGestureGen = 0;

    const docMoveOpts = { capture: true, passive: false };
    const docEndOpts = { capture: true, passive: true };

    const getTouchById = (touchList, id) => {
      for (let i = 0; i < touchList.length; i += 1) {
        if (touchList[i].identifier === id) return touchList[i];
      }
      return null;
    };

    const shouldIgnoreTarget = (target) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('[data-testid="category-chips-row"]')) return true;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
      return false;
    };

    const flushPan = (payload) => {
      if (rafId) cancelAnimationFrame(rafId);
      const genAtSchedule = panGestureGen;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (genAtSchedule !== panGestureGen) return;
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

      panGestureGen += 1;
      ignoreGesture = false;
      tracking = true;
      panMode = null;
      startX = t.clientX;
      startY = t.clientY;
      if (interactiveRef.current) clearPan();
      activeTouchId = t.identifier;
      document.addEventListener('touchmove', onDocumentTouchMove, docMoveOpts);
      document.addEventListener('touchend', onDocumentTouchEnd, docEndOpts);
      document.addEventListener('touchcancel', onDocumentTouchCancel, docEndOpts);
    };

    /** Document-level: interactive pan replaces the touch target subtree; element-level move stops. */
    function onDocumentTouchMove(e) {
      if (!tracking || ignoreGesture) return;
      const t = getTouchById(e.touches, activeTouchId);
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (interactiveRef.current) {
        const w = (elementRef.current?.clientWidth ?? el.clientWidth) || 1;
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
    }

    function onDocumentTouchEnd(e) {
      const t = getTouchById(e.changedTouches, activeTouchId);
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const wasTracking = tracking && !ignoreGesture;

      tracking = false;
      ignoreGesture = false;
      panGestureGen += 1;
      activeTouchId = -1;
      removeDocumentTracking();

      if (!wasTracking) {
        panMode = null;
        clearPan();
        return;
      }

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
          const w = (elementRef.current?.clientWidth ?? el.clientWidth) || 1;
          const threshold = Math.max(SWIPE_THRESHOLD_PX, w * COMMIT_WIDTH_RATIO);
          let commit = false;
          if (panMode === 'next') commit = dx <= -threshold;
          else commit = dx >= threshold;

          const mostlyHorizontal =
            Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO ||
            Math.abs(dx) >= threshold * 0.55;
          if (commit && mostlyHorizontal) {
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
    }

    function onDocumentTouchCancel(e) {
      const t = getTouchById(e.changedTouches, activeTouchId);
      if (!t) return;

      tracking = false;
      ignoreGesture = false;
      panMode = null;
      panGestureGen += 1;
      activeTouchId = -1;
      removeDocumentTracking();
      clearPan();
    }

    function removeDocumentTracking() {
      document.removeEventListener('touchmove', onDocumentTouchMove, docMoveOpts);
      document.removeEventListener('touchend', onDocumentTouchEnd, docEndOpts);
      document.removeEventListener('touchcancel', onDocumentTouchCancel, docEndOpts);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      removeDocumentTracking();
      el.removeEventListener('touchstart', onTouchStart);
    };
  }, [elementRef]);
}
