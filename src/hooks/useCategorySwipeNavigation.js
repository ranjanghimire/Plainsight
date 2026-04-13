import { useEffect, useRef } from 'react';
import { MENU_RIGHT_EDGE_SWIPE_PX } from '../constants/menuEdgeSwipe';

const SWIPE_THRESHOLD_PX = 48;
const HORIZONTAL_DOMINANCE_RATIO = 1.2;

/**
 * Horizontal swipe on the main notes workspace: left → next category, right → previous,
 * in the same order as {@link CategoryChips} (All, named categories, Undefined when shown).
 * Touches that begin in the right menu-edge strip are ignored so {@link useDrawerGestures} keeps working.
 *
 * When `interactive` is true (non-archive notes mode), `onPan` receives live `{ mode, tx, w }`
 * so the UI can show adjacent categories while the finger moves; otherwise only `onSelectFilter` fires on touchend.
 *
 * When `onPanRelease` is set (interactive), the host runs midpoint / settle animation and category commit;
 * `onSelectFilter` is not called from this hook on touchend for that path.
 */
export function useCategorySwipeNavigation({
  elementRef,
  filterSequence,
  categoryFilter,
  onSelectFilter,
  isInteractionLocked,
  /** Live pan callback; pass `null` to clear. */
  onPan,
  /** Finger lifted after a horizontal pan; host animates settle and may commit the category. */
  onPanRelease,
  interactive = false,
}) {
  const seqRef = useRef(filterSequence);
  const filterRef = useRef(categoryFilter);
  const onSelectRef = useRef(onSelectFilter);
  const lockedRef = useRef(isInteractionLocked);
  const onPanRef = useRef(onPan);
  const onPanReleaseRef = useRef(onPanRelease);
  const interactiveRef = useRef(interactive);

  seqRef.current = filterSequence;
  filterRef.current = categoryFilter;
  onSelectRef.current = onSelectFilter;
  lockedRef.current = isInteractionLocked;
  onPanRef.current = onPan;
  onPanReleaseRef.current = onPanRelease;
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
    /** Recent {x,t} during pan for release velocity (px/ms over ~last 100ms). */
    let velHist = [];
    const VEL_WINDOW_MS = 100;
    const VEL_HIST_MAX = 14;

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
      velHist = [];
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
          const now = e.timeStamp || performance.now();
          velHist.push({ x: t.clientX, t: now });
          while (velHist.length > 0 && now - velHist[0].t > VEL_WINDOW_MS) {
            velHist.shift();
          }
          if (velHist.length > VEL_HIST_MAX) velHist.shift();
        } else if (panMode === 'prev') {
          const tx = Math.max(Math.min(-w + dx, 0), -w);
          flushPan({ mode: 'prev', tx, w });
          const now = e.timeStamp || performance.now();
          velHist.push({ x: t.clientX, t: now });
          while (velHist.length > 0 && now - velHist[0].t > VEL_WINDOW_MS) {
            velHist.shift();
          }
          if (velHist.length > VEL_HIST_MAX) velHist.shift();
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
          const mode = panMode;
          const finalTx =
            mode === 'next'
              ? Math.max(Math.min(dx, 0), -w)
              : Math.max(Math.min(-w + dx, 0), -w);
          const endT = e.timeStamp || performance.now();
          let vx = 0;
          if (velHist.length >= 2) {
            const a = velHist[0];
            const b = velHist[velHist.length - 1];
            const dt = Math.max(8, b.t - a.t);
            vx = (b.x - a.x) / dt;
          }
          if (onPanReleaseRef.current) {
            onPanReleaseRef.current({
              mode,
              tx: finalTx,
              w,
              vx,
              dx,
              dy,
            });
          } else {
            const threshold = Math.max(SWIPE_THRESHOLD_PX, w * 0.18);
            let commit = false;
            if (mode === 'next') commit = dx <= -threshold;
            else commit = dx >= threshold;
            const mostlyHorizontal =
              Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE_RATIO ||
              Math.abs(dx) >= threshold * 0.55;
            if (commit && mostlyHorizontal) {
              const nextCat =
                mode === 'next'
                  ? seq[(idx + 1) % seq.length]
                  : seq[(idx - 1 + seq.length) % seq.length];
              onSelectRef.current(nextCat);
            }
            clearPan();
          }
        } else {
          clearPan();
        }
        panMode = null;
        velHist = [];
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
      velHist = [];
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
