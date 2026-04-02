import { useState, useRef, useCallback, useEffect } from 'react';

/** Slightly under typical iOS text-selection / callout timing (~500ms) so our menu wins the race. */
const LONG_PRESS_MS = 380;
const MOVE_THRESHOLD_PX = 12;

/** Merge into trigger `className` — reduces iOS/Android text selection & system callout on long-press. */
export const CONTEXT_MENU_TRIGGER_CLASS =
  'select-none [-webkit-touch-callout:none] touch-none';

function clearNativeTextSelection() {
  if (typeof window === 'undefined' || !window.getSelection) return;
  try {
    window.getSelection().removeAllRanges();
  } catch {
    /* ignore */
  }
}

function clampMenuPosition(clientX, clientY) {
  const menuW = 170;
  const menuH = 96;
  const pad = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  return {
    x: Math.min(Math.max(pad, clientX), Math.max(pad, vw - menuW - pad)),
    y: Math.min(Math.max(pad, clientY), Math.max(pad, vh - menuH - pad)),
  };
}

function allowsContextMenu() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine)').matches;
}

function distance2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/**
 * Long-press (mobile/coarse) + right-click (fine pointer) → shared menu coordinates + target.
 */
export function useItemContextMenu() {
  const [menu, setMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    target: null,
  });
  const [entered, setEntered] = useState(false);
  const suppressNextClickRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const longPressOriginRef = useRef(null);
  const longPressTargetRef = useRef(null);
  /** Stable ref callbacks per trigger so React does not churn native listeners each render. */
  const touchLockRefByKey = useRef(new Map());

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
    longPressTargetRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    setEntered(false);
    setMenu((m) => ({ ...m, open: false, target: null }));
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const openMenu = useCallback((target, clientX, clientY) => {
    clearLongPressTimer();
    clearNativeTextSelection();
    const { x, y } = clampMenuPosition(clientX, clientY);
    setEntered(false);
    setMenu({ open: true, x, y, target });
    window.requestAnimationFrame(() => {
      clearNativeTextSelection();
      window.requestAnimationFrame(() => {
        clearNativeTextSelection();
        window.setTimeout(clearNativeTextSelection, 0);
      });
    });
  }, [clearLongPressTimer]);

  useEffect(() => {
    if (!menu.open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [menu.open]);

  useEffect(() => {
    if (!menu.open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    const onScroll = () => closeMenu();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu.open, closeMenu]);

  useEffect(() => {
    const onScroll = () => clearLongPressTimer();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [clearLongPressTimer]);

  const getTouchLockRef = useCallback((target) => {
    const key =
      target.kind === 'workspace'
        ? `ws:${target.entry.key}`
        : `cat:${target.name}`;
    let cb = touchLockRefByKey.current.get(key);
    if (!cb) {
      let prevEl = null;
      let handler = null;
      cb = (el) => {
        if (prevEl && handler) {
          prevEl.removeEventListener('touchstart', handler);
        }
        prevEl = el;
        handler = null;
        if (!el) return;
        const mayTouch =
          typeof window !== 'undefined' &&
          ((typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
            'ontouchstart' in window);
        if (!mayTouch) return;
        handler = (e) => {
          if (e.touches.length === 1 && e.cancelable) {
            e.preventDefault();
          }
        };
        el.addEventListener('touchstart', handler, { passive: false });
      };
      touchLockRefByKey.current.set(key, cb);
    }
    return cb;
  }, []);

  const bindTrigger = useCallback(
    (target, userOnClick) => {
      const startLongPress = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        clearLongPressTimer();
        longPressOriginRef.current = { x: e.clientX, y: e.clientY };
        longPressTargetRef.current = target;
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          const t = longPressTargetRef.current;
          const o = longPressOriginRef.current;
          longPressOriginRef.current = null;
          longPressTargetRef.current = null;
          if (t && o) {
            suppressNextClickRef.current = true;
            openMenu(t, o.x, o.y);
          }
        }, LONG_PRESS_MS);
      };

      const onPointerMove = (e) => {
        const o = longPressOriginRef.current;
        if (!o || longPressTimerRef.current == null) return;
        if (
          distance2(o.x, o.y, e.clientX, e.clientY) >
          MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX
        ) {
          clearLongPressTimer();
        }
      };

      const endLongPressArm = () => {
        clearLongPressTimer();
      };

      return {
        ref: getTouchLockRef(target),
        onPointerDown: startLongPress,
        onPointerMove,
        onPointerUp: endLongPressArm,
        onPointerCancel: endLongPressArm,
        onContextMenu: (e) => {
          e.preventDefault();
          if (!allowsContextMenu()) return;
          openMenu(target, e.clientX, e.clientY);
        },
        onClick: (e) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          userOnClick?.(e);
        },
      };
    },
    [clearLongPressTimer, getTouchLockRef, openMenu],
  );

  return {
    menu,
    entered,
    openMenu,
    closeMenu,
    bindTrigger,
  };
}
