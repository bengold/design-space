import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Tracks an element's viewport rect through canvas pan/zoom transforms.
// ResizeObserver doesn't fire on transform changes and floating-ui's autoUpdate
// needs both ref+floating elements, so just rAF-poll while mounted.
function useElementRect(el) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!el) {
      setRect(null);
      return undefined;
    }
    let rafId;
    const tick = () => {
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev &&
          prev.top === r.top &&
          prev.left === r.left &&
          prev.width === r.width &&
          prev.height === r.height
        ) {
          return prev;
        }
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [el]);
  return rect;
}

export function SelectionBox({ el, variant }) {
  const rect = useElementRect(el);
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  return (
    <div
      className={cn(
        // z-30: above the canvas, below the Sheet (z-50). Otherwise the
        // selection outline shows through the edit panel.
        'pointer-events-none fixed z-30 box-border ds-review-ui',
        // Figma-style outline only — no fill — so the element underneath stays
        // visible. Hover uses a thin dashed line; select uses a solid 1px.
        variant === 'select'
          ? 'outline-[1.5px] outline-offset-0 outline-sky-500'
          : 'outline-1 outline-dashed outline-sky-400/80',
      )}
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    />
  );
}
