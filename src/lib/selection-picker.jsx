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
import { SelectionBox } from './selection-box.jsx';

// Probe ±6px around the hit point and prefer the thinnest crossable hit.
// elementsFromPoint only returns elements whose box contains the exact pixel,
// so a 2px stroke / `<hr>` / thin divider is effectively un-clickable; this
// probe gives them a ~14px virtual hit area. Only activates when the direct
// hit is a large container (≥100px in either axis) with children — won't
// hijack clicks on legitimate large leaves like `<img>`.
const THIN = 10;
const PROBE = 6;
const CONTAINER = 100;
function probeThin(x, y, el) {
  if (!el) return el;
  const r = el.getBoundingClientRect();
  if (r.width < CONTAINER || r.height < CONTAINER || el.children.length === 0) return el;
  let best = null;
  let bestDim = THIN;
  for (let dx = -PROBE; dx <= PROBE; dx += PROBE) {
    for (let dy = -PROBE; dy <= PROBE; dy += PROBE) {
      if (dx === 0 && dy === 0) continue;
      const stack = document.elementsFromPoint(x + dx, y + dy);
      const idx = stack.indexOf(el);
      if (idx < 0) continue;
      for (let i = 0; i < idx; i += 1) {
        const candidate = stack[i];
        if (!isReviewTarget(candidate) || candidate.closest('.ds-review-ui')) continue;
        const cr = candidate.getBoundingClientRect();
        const dim = Math.min(cr.width, cr.height);
        if (dim > 0 && dim < bestDim) {
          best = candidate;
          bestDim = dim;
        }
      }
    }
  }
  return best || el;
}

// "Drill" when clicking inside the current primary. Newly-inserted elements
// often land behind z-indexed siblings; without this, clicking inside the
// selection picks the sibling instead of the descendant the user pointed at.
function pickWithDrill(x, y, primary) {
  const stack = document.elementsFromPoint(x, y);
  let chosen = stack.find((n) => isReviewTarget(n) && !n.closest('.ds-review-ui'));
  if (!chosen) return null;
  if (primary && chosen !== primary && !primary.contains(chosen)) {
    for (let i = 1; i < stack.length; i += 1) {
      const n = stack[i];
      if (!isReviewTarget(n) || n.closest('.ds-review-ui')) continue;
      if (n === primary || primary.contains(n)) {
        chosen = n;
        break;
      }
    }
  }
  return probeThin(x, y, chosen);
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
      className="pointer-events-none fixed z-30 border-2 border-dashed border-sky-400 bg-sky-400/10 ds-review-ui"
      style={box}
    />
  ) : null;
  return { overlay, dragging: !!box };
}

// Inline contentEditable text-editing for a single leaf element. Returns
// { begin, commit, revert, active } so the picker can drive it from dblclick
// and key handlers. The caller wires `onCommit` to persist textContent.
function useInlineTextEdit({ onCommit }) {
  const stateRef = useRef(null); // { el, original }
  const [activeEl, setActiveEl] = useState(null);

  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    try {
      s.el.contentEditable = 'false';
      s.el.removeAttribute('data-ds-editing');
    } catch {
      /* element unmounted */
    }
    stateRef.current = null;
    setActiveEl(null);
  }, []);

  const begin = useCallback((el) => {
    if (!el) return;
    // Refuse only when the subtree contains another tracked element — editing
    // those would either be incorrect (overlap) or break their own ref-anchored
    // overrides. Elements with non-tracked children (icons, decorative spans)
    // are fair game; OverridesInjector's apply-back is guarded for safety.
    if (el.querySelector('[data-ds-ref]')) return;
    const original = el.textContent || '';
    stateRef.current = { el, original };
    setActiveEl(el);
    el.contentEditable = 'true';
    el.setAttribute('data-ds-editing', '');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const commit = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const after = s.el.textContent || '';
    if (after !== s.original) onCommit?.(s.el, after);
    cleanup();
  }, [cleanup, onCommit]);

  const revert = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.el.textContent = s.original;
    cleanup();
  }, [cleanup]);

  return { begin, commit, revert, activeEl };
}

/**
 * DevTools-style picking: hover outline, click/shift/marquee multi-select, arrow-key tree walk.
 */
export function useSelectionPicker({
  active,
  multiSelect,
  onPick,
  onElementsChange,
  onTextEditCommit,
}) {
  const [hoverEl, setHoverEl] = useState(null);
  const [selected, setSelected] = useState([]);
  const justDraggedRef = useRef(false);

  const textEdit = useInlineTextEdit({ onCommit: onTextEditCommit });

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

  // Hot state read by handlers below — held in refs so changes don't re-bind
  // four `document` listeners on every hover/selection tick.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const hoverElRef = useRef(hoverEl);
  hoverElRef.current = hoverEl;
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const textEditRef = useRef(textEdit);
  textEditRef.current = textEdit;

  useEffect(() => {
    if (!active) {
      setHoverEl(null);
      setSelected([]);
      return undefined;
    }

    const onMove = (e) => {
      if (draggingRef.current || textEditRef.current.activeEl) return;
      const el = pickWithDrill(e.clientX, e.clientY, selectedRef.current[0] || null);
      if (!el) {
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
      // Let explicit non-commentable UI (artboard chrome controls, etc.)
      // handle clicks normally even while picker capture is active.
      if (e.target.closest('[data-noncommentable]')) return;
      const te = textEditRef.current;
      if (te.activeEl) {
        // While editing, clicks outside the editing element commit and exit.
        if (!te.activeEl.contains(e.target)) te.commit();
        return;
      }
      if (e.target.closest('.ds-review-ui')) return;
      const el = pickWithDrill(e.clientX, e.clientY, selectedRef.current[0] || null);
      if (!el) return;
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

    const onDblClick = (e) => {
      const te = textEditRef.current;
      if (te.activeEl) return;
      if (e.target.closest('[data-noncommentable]')) return;
      if (e.target.closest('.ds-review-ui')) return;
      const el = pickWithDrill(e.clientX, e.clientY, selectedRef.current[0] || null);
      if (!el || !onTextEditCommit) return;
      e.preventDefault();
      e.stopPropagation();
      ensureDsRef(el);
      setSelection([el]);
      te.begin(el);
    };

    const onKey = (e) => {
      const te = textEditRef.current;
      if (te.activeEl) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          te.revert();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          te.commit();
        }
        return;
      }
      if (!active || e.target.closest('input, textarea, select, [contenteditable]')) return;
      const sel = selectedRef.current;
      const current = sel[0] || hoverElRef.current;
      if (!current) return;
      let next = null;
      if (e.key === 'ArrowUp') next = getReviewParent(current);
      else if (e.key === 'ArrowDown') next = getReviewChild(current);
      else if (e.key === 'ArrowLeft') next = getReviewSibling(current, -1);
      else if (e.key === 'ArrowRight') next = getReviewSibling(current, 1);
      else if (e.key === 'Enter' && sel.length) {
        e.preventDefault();
        if (multiSelect) onPick?.(sel, sel.map(describeElement));
        else pickPrimary(sel[0]);
        return;
      } else if ((e.key === 'F2' || (e.key === 'Enter' && e.altKey)) && sel.length === 1) {
        // F2 (or Alt+Enter) on a single selection enters inline text editing —
        // keyboard equivalent of double-click.
        if (onTextEditCommit) {
          e.preventDefault();
          te.begin(sel[0]);
          return;
        }
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
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKey, true);
    document.body.style.cursor = textEditRef.current.activeEl ? '' : 'crosshair';

    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.cursor = '';
    };
  }, [active, multiSelect, onPick, onElementsChange, onTextEditCommit, pickPrimary, setSelection]);

  const overlay = active ? (
    <>
      {hoverEl && !selected.includes(hoverEl) && !textEdit.activeEl && (
        <SelectionBox el={hoverEl} variant="hover" />
      )}
      {selected.map((el) => (
        <SelectionBox key={ensureDsRef(el)} el={el} variant="select" />
      ))}
      {marqueeOverlay}
      {/* Editing outline — distinct color so user knows they're in text-edit mode. */}
      <style>{`[data-ds-editing]{outline:2px solid #2563EB;outline-offset:2px;cursor:text}`}</style>
    </>
  ) : null;

  return { overlay, selected, hoverEl, setSelection, clearSelection: () => setSelection([]) };
}
