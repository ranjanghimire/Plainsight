import { useEffect, useState } from 'react';

const FAB_PX = 44;
const GAP_ABOVE_KEYBOARD = 10;

/**
 * `top` (px) for a `position:fixed` control so it sits just above the visual viewport
 * bottom (i.e. immediately above the software keyboard when open).
 */
export function useFloatingSubmitTopPx(fabHeightPx = FAB_PX) {
  const [topPx, setTopPx] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight - fabHeightPx - 24 : 400,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      const onResize = () => {
        setTopPx(window.innerHeight - fabHeightPx - 24);
      };
      onResize();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const update = () => {
      const bottomOfVisual = vv.offsetTop + vv.height;
      const next = bottomOfVisual - fabHeightPx - GAP_ABOVE_KEYBOARD;
      setTopPx(Math.max(8, next));
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [fabHeightPx]);

  return topPx;
}
