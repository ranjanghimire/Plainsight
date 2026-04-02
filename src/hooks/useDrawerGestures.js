import { useEffect, useRef } from 'react';

const EDGE_PX = 20;
const THRESHOLD = 30;

/**
 * Right-edge swipe left opens the menu; swipe right closes it when open.
 * Touch listeners on document; avoids blocking scroll unless edge + horizontal intent.
 */
export function useDrawerGestures({ isOpen, onOpen, onClose }) {
  const isOpenRef = useRef(isOpen);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  isOpenRef.current = isOpen;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isEdgeSwipeRef = useRef(false);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const w = window.innerWidth;
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      currentXRef.current = t.clientX;
      currentYRef.current = t.clientY;
      isDraggingRef.current = true;
      isEdgeSwipeRef.current = !isOpenRef.current && t.clientX >= w - EDGE_PX;
    };

    const onTouchMove = (e) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      currentXRef.current = t.clientX;
      currentYRef.current = t.clientY;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;
      if (
        isEdgeSwipeRef.current &&
        !isOpenRef.current &&
        Math.abs(dx) > Math.abs(dy) &&
        dx < 0
      ) {
        e.preventDefault();
      }
    };

    const endDrag = (e) => {
      if (!isDraggingRef.current) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const endX = t.clientX;
      const endY = t.clientY;
      const startX = startXRef.current;
      const startY = startYRef.current;
      const dx = endX - startX;
      const dy = endY - startY;

      isDraggingRef.current = false;
      const wasEdge = isEdgeSwipeRef.current;
      isEdgeSwipeRef.current = false;

      const horizontal = Math.abs(dx) > Math.abs(dy);

      if (!isOpenRef.current) {
        if (wasEdge && startX - endX > THRESHOLD && horizontal) {
          onOpenRef.current();
        }
        return;
      }

      if (endX - startX > THRESHOLD && horizontal) {
        onCloseRef.current();
      }
    };

    const onTouchEnd = (e) => {
      endDrag(e);
    };

    const onTouchCancel = () => {
      isDraggingRef.current = false;
      isEdgeSwipeRef.current = false;
    };

    const root = document.documentElement;
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);
}
