import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collectTargetsInRect,
  describeElement,
  ensureDsRef,
  getReviewChild,
  getReviewParent,
  getReviewSibling,
  isReviewTarget,
} from './elementContext.js';

const OUTLINE_HOVER = '2px dashed #4a9eff';
const OUTLINE_SELECT = '2px solid #D97757';
const FILL_SELECT = 'rgba(217, 119, 87, 0.12)';

function SelectionBox({ el, variant }) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (!el) {
      setBox(null);
      return undefined;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [el]);

  if (!box || box.width < 1 || box.height < 1) return null;
  const isSelect = variant === 'select';
  return (
    <div
      className="ds-review-ui"
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        outline: isSelect ? OUTLINE_SELECT : OUTLINE_HOVER,
        background: isSelect ? FILL_SELECT : 'transparent',
        zIndex: 99990,
        boxSizing: 'border-box',
      }}
    />
  );
}

/**
 * DevTools-style picking: hover outline, click/shift/marquee multi-select, arrow-key tree walk.
 */
export function useSelectionPicker({ active, multiSelect, onPick, onElementsChange }) {
  const [hoverEl, setHoverEl] = useState(null);
  const [selected, setSelected] = useState([]);
  const marqueeRef = useRef(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);

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

  useEffect(() => {
    if (!active) {
      setHoverEl(null);
      setSelected([]);
      return undefined;
    }

    const onMove = (e) => {
      if (dragRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !isReviewTarget(el) || el.closest('.ds-review-ui')) {
        setHoverEl(null);
        return;
      }
      setHoverEl(el);
    };

    const onMouseDown = (e) => {
      if (e.button !== 0 || e.target.closest('.ds-review-ui')) return;
      if (!e.target.closest('.design-canvas, #root')) return;
      const t = e.target;
      if (isReviewTarget(t)) return;
      dragRef.current = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      marqueeRef.current = document.createElement('div');
      Object.assign(marqueeRef.current.style, {
        position: 'fixed',
        border: '2px dashed #4a9eff',
        background: 'rgba(74, 158, 255, 0.08)',
        pointerEvents: 'none',
        zIndex: '99991',
      });
      document.body.appendChild(marqueeRef.current);
    };

    const onMouseMove = (e) => {
      if (!dragRef.current || !marqueeRef.current) return;
      dragRef.current.x1 = e.clientX;
      dragRef.current.y1 = e.clientY;
      const { x0, y0, x1, y1 } = dragRef.current;
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      marqueeRef.current.style.left = `${left}px`;
      marqueeRef.current.style.top = `${top}px`;
      marqueeRef.current.style.width = `${Math.abs(x1 - x0)}px`;
      marqueeRef.current.style.height = `${Math.abs(y1 - y0)}px`;
    };

    const finishMarquee = () => {
      if (!dragRef.current) return;
      const { x0, y0, x1, y1 } = dragRef.current;
      dragRef.current = null;
      if (marqueeRef.current) {
        marqueeRef.current.remove();
        marqueeRef.current = null;
      }
      if (Math.abs(x1 - x0) < 6 && Math.abs(y1 - y0) < 6) return;
      didDragRef.current = true;
      const rect = {
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        right: Math.max(x0, x1),
        bottom: Math.max(y0, y1),
      };
      const hits = collectTargetsInRect(rect);
      if (hits.length) {
        setSelection(hits);
        if (multiSelect) onPick?.(hits, hits.map(describeElement));
      }
    };

    const onClick = (e) => {
      if (didDragRef.current) {
        didDragRef.current = false;
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
          const has = prev.includes(el);
          const next = has ? prev.filter((x) => x !== el) : [...prev, el];
          onElementsChange?.(next);
          return next;
        });
      } else {
        setSelection([el]);
        pickPrimary(el);
      }
    };

    const onKey = (e) => {
      if (!active || e.target.closest('input, textarea, select')) return;
      const current = selected[0] || hoverEl;
      if (!current) return;
      let next = null;
      if (e.key === 'ArrowUp') {
        next = getReviewParent(current);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        next = getReviewChild(current);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        next = getReviewSibling(current, -1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        next = getReviewSibling(current, 1);
        e.preventDefault();
      } else if (e.key === 'Enter' && selected.length) {
        e.preventDefault();
        if (multiSelect) onPick?.(selected, selected.map(describeElement));
        else pickPrimary(selected[0]);
        return;
      }
      if (next) {
        setSelection([next]);
        setHoverEl(next);
        pickPrimary(next);
      }
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', finishMarquee, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.body.style.cursor = active ? 'crosshair' : '';

    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', finishMarquee, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.cursor = '';
      if (marqueeRef.current) marqueeRef.current.remove();
      dragRef.current = null;
    };
  }, [active, multiSelect, onPick, pickPrimary, setSelection, selected, hoverEl]);

  const overlay = active ? (
    <>
      {hoverEl && !selected.includes(hoverEl) && <SelectionBox el={hoverEl} variant="hover" />}
      {selected.map((el) => (
        <SelectionBox key={ensureDsRef(el)} el={el} variant="select" />
      ))}
    </>
  ) : null;

  return { overlay, selected, hoverEl, setSelection, clearSelection: () => setSelection([]) };
}
