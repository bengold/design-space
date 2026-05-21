/** Build agent-readable element context from a DOM node (Claude Design–style). */

let refCounter = 0;

export function ensureDsRef(el) {
  if (!el || el.nodeType !== 1) return null;
  if (!el.dataset.dsRef) {
    refCounter += 1;
    el.dataset.dsRef = `ds-${refCounter}`;
  }
  return el.dataset.dsRef;
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
  if (el.closest('.design-canvas') === null && !el.closest('#root')) return false;
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
