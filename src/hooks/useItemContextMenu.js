import { useState, useRef, useCallback, useEffect } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 12;

/** Merge into trigger `className` — reduces iOS/Android text selection & system callout on long-press. */
export const CONTEXT_MENU_TRIGGER_CLASS =
  'select-none [-webkit-touch-callout:none] touch-manipulation';

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
 *
 * Note: We do not use non-passive touchstart + preventDefault() on triggers — that blocks iOS
 * tap-to-activate (synthetic click) and breaks normal taps on workspace rows / chips.
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

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
    longPressTargetRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    suppressNextClickRef.current = false;
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
    window.requestAnimationFrame(() => clearNativeTextSelection());
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
    [clearLongPressTimer, openMenu],
  );

  return {
    menu,
    entered,
    openMenu,
    closeMenu,
    bindTrigger,
  };
}
