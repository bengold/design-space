/** Build agent-readable element context from a DOM node (Claude Design–style). */

// Refs are STRUCTURAL — `<slotId>:<child-index-path>` — so they recompute to
// the same value on reload, without persisting a session-only counter. The
// `data-ds-anchor` JSX attribute is honored as a stable name when present
// (preferred for refs that should survive structural edits to the design).
export function ensureDsRef(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.dataset.dsRef) return el.dataset.dsRef;
  const slot = el.closest('[data-dc-slot]');
  if (!slot) return null;
  const slotId = slot.dataset.dcSlot;
  if (el === slot) {
    el.dataset.dsRef = `${slotId}:root`;
    return el.dataset.dsRef;
  }
  if (el.dataset.dsAnchor) {
    const ref = `${slotId}:@${el.dataset.dsAnchor}`;
    el.dataset.dsRef = ref;
    return ref;
  }
  const path = [];
  let node = el;
  while (node && node !== slot) {
    const parent = node.parentElement;
    if (!parent) break;
    const idx = Array.prototype.indexOf.call(parent.children, node);
    path.unshift(idx);
    node = parent;
  }
  const ref = `${slotId}:${path.join('.')}`;
  el.dataset.dsRef = ref;
  return ref;
}

/** Inverse of ensureDsRef — find the element a ref points at on a fresh page. */
export function resolveDsRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const [slotId, rest] = ref.split(':');
  if (!slotId) return null;
  const slot = document.querySelector(`[data-dc-slot="${CSS.escape(slotId)}"]`);
  if (!slot) return null;
  if (!rest || rest === 'root') return slot;
  if (rest.startsWith('@')) {
    const name = rest.slice(1);
    return slot.querySelector(`[data-ds-anchor="${CSS.escape(name)}"]`);
  }
  const indices = rest.split('.').map((n) => Number(n));
  let node = slot;
  for (const idx of indices) {
    if (!node?.children || !Number.isFinite(idx)) return null;
    node = node.children[idx];
    if (!node) return null;
  }
  return node;
}

function reactChain(el) {
  const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  const names = [];
  let fiber = el[fiberKey];
  while (fiber) {
    const type = fiber.type;
    if (typeof type === 'string') names.unshift(type);
    else if (type?.displayName) names.unshift(type.displayName);
    else if (type?.name) names.unshift(type.name);
    fiber = fiber.return;
    if (names.length > 12) break;
  }
  return names.length ? names.join(' > ') : null;
}

// Walk React fiber for `_debugSource`. Vite + @vitejs/plugin-react preserves
// this in dev — it tells the agent the exact JSX file:line the comment targets,
// so it can edit without grepping. Strips the absolute project prefix when we
// can spot a `designs/<name>` segment, so the output is repo-relative.
function reactSource(el) {
  const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  let fiber = el[fiberKey];
  let hops = 0;
  while (fiber && hops < 24) {
    const src = fiber._debugSource;
    if (src?.fileName) {
      const file = String(src.fileName);
      const designsIdx = file.lastIndexOf('/designs/');
      const srcIdx = file.lastIndexOf('/src/');
      const rel =
        designsIdx >= 0 ? file.slice(designsIdx + 1) : srcIdx >= 0 ? file.slice(srcIdx + 1) : file;
      const line = Number.isFinite(src.lineNumber) ? `:${src.lineNumber}` : '';
      const col = Number.isFinite(src.columnNumber) ? `:${src.columnNumber}` : '';
      return `${rel}${line}${col}`;
    }
    fiber = fiber.return;
    hops += 1;
  }
  return null;
}

function domChain(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 8) {
    let part = node.tagName.toLowerCase();
    if (node.id) part += `#${node.id}`;
    else if (node.className && typeof node.className === 'string') {
      const cls = node.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function nearestArtboard(el) {
  const slot = el?.closest?.('[data-dc-slot]');
  if (!slot) return null;
  const section = el.closest('[data-dc-section]');
  return {
    artboardId: slot.dataset.dcSlot,
    sectionId: section?.getAttribute('data-dc-section') || null,
    label: slot.querySelector('.dc-editable')?.textContent?.trim() || slot.dataset.dcSlot,
  };
}

export function describeElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const ref = ensureDsRef(el);
  const artboard = nearestArtboard(el);
  const text = (el.textContent || '').trim().slice(0, 120);
  return {
    ref,
    anchor: ref,
    react: reactChain(el),
    source: reactSource(el),
    dom: domChain(el),
    tag: el.tagName.toLowerCase(),
    text: text || null,
    artboardId: artboard?.artboardId || null,
    sectionId: artboard?.sectionId || null,
    artboardLabel: artboard?.label || null,
  };
}

export function formatMentionedElement(ctx, commentText) {
  const lines = [
    '<mentioned-element>',
    ctx.artboardId
      ? `artboard: ${ctx.sectionId || 'main'}/${ctx.artboardId}${ctx.artboardLabel ? ` (${ctx.artboardLabel})` : ''}`
      : null,
    ctx.source ? `source: ${ctx.source}` : null,
    ctx.react ? `react: ${ctx.react}` : null,
    `dom: ${ctx.dom}`,
    `id: ${ctx.ref}`,
    commentText ? `comment: ${commentText}` : null,
    '</mentioned-element>',
  ].filter(Boolean);
  return lines.join('\n');
}

export function isReviewTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.closest('[data-noncommentable], .dc-header, .twk-panel, .ds-review-ui')) return false;
  // Only the actual mockup contents — the artboard slot and everything inside.
  // Canvas chrome (toolbar, section headers, post-its, etc.) is not pickable.
  if (!el.closest('[data-dc-slot]')) return false;
  return true;
}

export function getReviewParent(el) {
  let node = el?.parentElement;
  while (node) {
    if (isReviewTarget(node)) return node;
    node = node.parentElement;
  }
  return null;
}

export function getReviewChild(el) {
  if (!el) return null;
  for (const child of el.children) {
    if (isReviewTarget(child)) return child;
  }
  return null;
}

export function getReviewSibling(el, direction) {
  if (!el?.parentElement) return null;
  const siblings = [...el.parentElement.children].filter(isReviewTarget);
  const idx = siblings.indexOf(el);
  if (idx < 0) return null;
  const next = siblings[idx + direction];
  return next || null;
}

/** Elements in preview whose bounds intersect the screen rect (marquee). */
export function collectTargetsInRect(rect) {
  const out = [];
  const nodes = document.querySelectorAll('#root *');
  for (const el of nodes) {
    if (!isReviewTarget(el)) continue;
    const r = el.getBoundingClientRect();
    const hit =
      r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom;
    if (hit) {
      ensureDsRef(el);
      out.push(el);
    }
  }
  return out;
}

export function formatMentionedElements(contexts, commentText) {
  return contexts.map((ctx) => formatMentionedElement(ctx, commentText)).join('\n\n');
}
