import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  collectTargetsInRect,
  describeElement,
  ensureDsRef,
  getReviewChild,
  getReviewParent,
  getReviewSibling,
  isReviewTarget,
} from './elementContext.js';

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

function SelectionBox({ el, variant }) {
  const rect = useElementRect(el);
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[99990] box-border ds-review-ui',
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

function useMarquee({ active, onCommit }) {
  const stateRef = useRef(null);
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (!active) return undefined;

    const onDown = (e) => {
      if (e.button !== 0 || e.target.closest('.ds-review-ui')) return;
      if (!e.target.closest('.design-canvas, #root')) return;
      if (isReviewTarget(e.target)) return;
      stateRef.current = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      setBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    };

    const onMove = (e) => {
      if (!stateRef.current) return;
      stateRef.current.x1 = e.clientX;
      stateRef.current.y1 = e.clientY;
      const { x0, y0, x1, y1 } = stateRef.current;
      setBox({
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      });
    };

    const onUp = () => {
      const s = stateRef.current;
      stateRef.current = null;
      setBox(null);
      if (!s) return;
      const { x0, y0, x1, y1 } = s;
      if (Math.abs(x1 - x0) < 6 && Math.abs(y1 - y0) < 6) return;
      const hits = collectTargetsInRect({
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        right: Math.max(x0, x1),
        bottom: Math.max(y0, y1),
      });
      if (hits.length) onCommit(hits);
    };

    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      stateRef.current = null;
    };
  }, [active, onCommit]);

  const overlay = box ? (
    <div
      className="pointer-events-none fixed z-[99991] border-2 border-dashed border-sky-400 bg-sky-400/10 ds-review-ui"
      style={box}
    />
  ) : null;
  return { overlay, dragging: !!box };
}

/**
 * DevTools-style picking: hover outline, click/shift/marquee multi-select, arrow-key tree walk.
 */
export function useSelectionPicker({ active, multiSelect, onPick, onElementsChange }) {
  const [hoverEl, setHoverEl] = useState(null);
  const [selected, setSelected] = useState([]);
  const justDraggedRef = useRef(false);

  const setSelection = useCallback(
    (els) => {
      const list = [...els];
      list.forEach((el) => ensureDsRef(el));
      setSelected(list);
      onElementsChange?.(list);
    },
    [onElementsChange],
  );

  const pickPrimary = useCallback(
    (el) => {
      if (!el) return;
      ensureDsRef(el);
      onPick?.(el, describeElement(el));
    },
    [onPick],
  );

  const onMarqueeCommit = useCallback(
    (hits) => {
      justDraggedRef.current = true;
      setSelection(hits);
      if (multiSelect) onPick?.(hits, hits.map(describeElement));
    },
    [multiSelect, onPick, setSelection],
  );

  const { overlay: marqueeOverlay, dragging } = useMarquee({
    active,
    onCommit: onMarqueeCommit,
  });

  useEffect(() => {
    if (!active) {
      setHoverEl(null);
      setSelected([]);
      return undefined;
    }

    const onMove = (e) => {
      if (dragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !isReviewTarget(el) || el.closest('.ds-review-ui')) {
        setHoverEl(null);
        return;
      }
      setHoverEl(el);
    };

    const onClick = (e) => {
      if (justDraggedRef.current) {
        justDraggedRef.current = false;
        return;
      }
      if (e.target.closest('.ds-review-ui')) return;
      const el = e.target;
      if (!isReviewTarget(el)) return;
      e.preventDefault();
      e.stopPropagation();
      ensureDsRef(el);
      if (multiSelect && e.shiftKey) {
        setSelected((prev) => {
          const next = prev.includes(el) ? prev.filter((x) => x !== el) : [...prev, el];
          onElementsChange?.(next);
          return next;
        });
      } else {
        setSelection([el]);
        pickPrimary(el);
      }
    };

    const onKey = (e) => {
      if (!active || e.target.closest('input, textarea, select, [contenteditable]')) return;
      const current = selected[0] || hoverEl;
      if (!current) return;
      let next = null;
      if (e.key === 'ArrowUp') next = getReviewParent(current);
      else if (e.key === 'ArrowDown') next = getReviewChild(current);
      else if (e.key === 'ArrowLeft') next = getReviewSibling(current, -1);
      else if (e.key === 'ArrowRight') next = getReviewSibling(current, 1);
      else if (e.key === 'Enter' && selected.length) {
        e.preventDefault();
        if (multiSelect) onPick?.(selected, selected.map(describeElement));
        else pickPrimary(selected[0]);
        return;
      }
      if (next) {
        e.preventDefault();
        setSelection([next]);
        setHoverEl(next);
        pickPrimary(next);
      }
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.body.style.cursor = 'crosshair';

    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.cursor = '';
    };
  }, [
    active,
    multiSelect,
    onPick,
    onElementsChange,
    pickPrimary,
    setSelection,
    selected,
    hoverEl,
    dragging,
  ]);

  const overlay = active ? (
    <>
      {hoverEl && !selected.includes(hoverEl) && <SelectionBox el={hoverEl} variant="hover" />}
      {selected.map((el) => (
        <SelectionBox key={ensureDsRef(el)} el={el} variant="select" />
      ))}
      {marqueeOverlay}
    </>
  ) : null;

  return { overlay, selected, hoverEl, setSelection, clearSelection: () => setSelection([]) };
}
