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

// Cached fiber key — re-probe on each call until we find it (the React root
// container has __reactContainer$, not __reactFiber$, so the first probe may
// fail). Caching null would poison lookups for the session.
let _fiberKey = null;
function findFiber(el) {
  if (!_fiberKey || !el[_fiberKey]) {
    for (const k in el) {
      if (k.startsWith('__reactFiber$')) {
        _fiberKey = k;
        break;
      }
    }
  }
  return _fiberKey ? el[_fiberKey] : null;
}

// Returns the nearest named React component above `el` (skips DOM tags).
function reactName(el) {
  let fiber = findFiber(el);
  let hops = 0;
  while (fiber && hops < 24) {
    const t = fiber.type || fiber.elementType;
    if (typeof t === 'function') {
      const n = t.displayName || t.name;
      if (n && n.length > 1) return n;
    } else if (t && typeof t === 'object' && t.displayName) {
      return t.displayName;
    }
    fiber = fiber.return;
    hops += 1;
  }
  return null;
}

function reactChain(el) {
  let fiber = findFiber(el);
  if (!fiber) return null;
  const names = [];
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
  let fiber = findFiber(el);
  if (!fiber) return null;
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

export function getReactComponentDescriptor(el) {
  if (!el || el.nodeType !== 1) return null;
  const name = reactName(el);
  if (!name) return null;
  const source = reactSource(el);
  const tag = el.tagName.toLowerCase();
  return {
    name,
    source,
    tag,
    key: [name, source || 'unknown-source', tag].join('|'),
  };
}

export function findReactComponentElements(descriptor) {
  if (!descriptor?.key) return [];
  const roots = scanRoots();
  const out = [];
  for (const root of roots) {
    const all = root.querySelectorAll('*');
    for (const el of all) {
      const next = getReactComponentDescriptor(el);
      if (next?.key === descriptor.key) out.push(el);
    }
  }
  return out;
}

function trunc(s, n = 24) {
  if (!s) return '';
  const compact = String(s).trim().replace(/\s+/g, ' ');
  return compact.length > n ? `${compact.slice(0, n)}…` : compact;
}

// Mid-truncate a SEP-joined path. Prefers keeping tail hops (closer to target)
// when budget runs out — head provides global location, tail tells you what
// you've actually picked.
function clampMid(joined, sep, n) {
  if (joined.length <= n) return joined;
  const parts = joined.split(sep);
  const head = [parts[0]];
  const tail = [parts[parts.length - 1]];
  let len = head[0].length + tail[0].length + sep.length + 1;
  let hi = 1;
  let ti = parts.length - 2;
  while (hi <= ti) {
    const t = parts[ti];
    if (len + sep.length + t.length <= n) {
      tail.unshift(t);
      len += sep.length + t.length;
      ti -= 1;
      continue;
    }
    const h = parts[hi];
    if (len + sep.length + h.length <= n) {
      head.push(h);
      len += sep.length + h.length;
      hi += 1;
      continue;
    }
    break;
  }
  if (hi > ti) return head.concat(tail).join(sep);
  return head.concat('…', tail).join(sep);
}

function domHop(el, wantIndex) {
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).slice(0, 2);
    for (const c of cls) s += `.${trunc(c, 20)}`;
  }
  const screenLabel = el.getAttribute?.('data-screen-label');
  if (screenLabel) s += `[screen="${trunc(screenLabel, 24)}"]`;
  if (wantIndex) {
    const p = el.parentElement;
    if (p && p.children.length > 1) {
      const idx = Array.prototype.indexOf.call(p.children, el);
      s += `[${idx + 1}/${p.children.length}]`;
    }
  }
  return s;
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

// Claude Design-style multi-line block, mid-truncated at 100-char budget.
// Captures: react component path, DOM hop path with screen-label markers,
// text/aria/alt snippets, child tag inventory.
function richDescriptorLines(el) {
  const LINE_MAX = 100;
  const SEP = ' › ';

  const reactPath = [];
  for (let a = el; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
    const rn = reactName(a);
    if (rn && rn !== reactPath[0]) reactPath.unshift(rn);
  }

  const domParts = [];
  for (let d = el; d && d.nodeType === 1 && d !== document.documentElement; d = d.parentElement) {
    domParts.unshift(domHop(d, d === el));
  }

  const textBits = [];
  const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  if (txt) textBits.push(`"${trunc(txt, 60)}"`);
  const aria = el.getAttribute?.('aria-label');
  if (aria) textBits.push(`aria-label: "${trunc(aria, 40)}"`);
  const alts = [];
  if (el.getAttribute?.('alt')) alts.push(el.getAttribute('alt'));
  const imgs = el.querySelectorAll?.('img[alt]') || [];
  for (let i = 0; i < imgs.length && alts.length < 3; i += 1) {
    const a2 = imgs[i].getAttribute('alt');
    if (a2) alts.push(a2);
  }
  if (alts.length) textBits.push(`alt: "${trunc(alts.join(' · '), 40)}"`);

  const kids = [];
  for (const c of el.childNodes) {
    if (c.nodeType === 1) kids.push(c.tagName.toLowerCase());
    else if (c.nodeType === 3 && c.textContent.trim()) kids.push('text');
    if (kids.length >= 12) break;
  }

  const lines = [];
  if (reactPath.length) lines.push(`react:    ${trunc(reactPath.join(SEP), LINE_MAX)}`);
  lines.push(`dom:      ${clampMid(domParts.join(SEP), SEP, LINE_MAX)}`);
  if (textBits.length) lines.push(`text:     ${trunc(textBits.join(' · '), LINE_MAX)}`);
  if (kids.length) lines.push(`children: ${trunc(kids.join(', '), LINE_MAX)}`);
  return lines;
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
    rich: richDescriptorLines(el),
  };
}

export function formatMentionedElement(ctx, commentText) {
  const head = [
    ctx.artboardId
      ? `artboard: ${ctx.sectionId || 'main'}/${ctx.artboardId}${ctx.artboardLabel ? ` (${ctx.artboardLabel})` : ''}`
      : null,
    ctx.source ? `source:   ${ctx.source}` : null,
  ].filter(Boolean);
  const body = ctx.rich?.length ? ctx.rich : [`dom:      ${ctx.dom}`];
  const tail = [`id:       ${ctx.ref}`, commentText ? `comment:  ${commentText}` : null].filter(
    Boolean,
  );
  return ['<mentioned-element>', ...head, ...body, ...tail, '</mentioned-element>'].join('\n');
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

// Scan the design surface for in-use colors/fonts. Capped at 500 elements for
// perf — enough breadth for "what's already on this page?" without scanning
// the host UI. Prefer `.design-canvas` so we don't pick up toolbar chrome;
// raw pages omit that class, so fall back to `#root` only when no canvas
// exists. Doing both at once would double-walk every canvas-page DOM tree.
function scanRoots() {
  const canvas = document.querySelectorAll('.design-canvas');
  if (canvas.length) return Array.from(canvas);
  const root = document.getElementById('root');
  return root ? [root] : document.body ? [document.body] : [];
}

export function getDocumentColors() {
  const seen = new Set();
  const colors = [];
  const props = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'];
  for (const root of scanRoots()) {
    const els = root.querySelectorAll('*');
    const max = Math.min(els.length, 500);
    for (let i = 0; i < max; i += 1) {
      const cs = window.getComputedStyle(els[i]);
      for (const p of props) {
        const v = cs[p];
        if (!v || v === 'none' || v.includes('rgba(0, 0, 0, 0)')) continue;
        if ((v.startsWith('rgb') || v.startsWith('#')) && !seen.has(v)) {
          seen.add(v);
          colors.push(v);
        }
      }
      if (colors.length >= 24) return colors;
    }
  }
  return colors;
}

export function getDocumentFonts() {
  const seen = new Set();
  const fonts = [];
  for (const root of scanRoots()) {
    const els = root.querySelectorAll('*');
    const max = Math.min(els.length, 500);
    for (let i = 0; i < max; i += 1) {
      const ff = window.getComputedStyle(els[i]).fontFamily;
      if (!ff) continue;
      const first = ff
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '');
      if (first && !seen.has(first)) {
        seen.add(first);
        fonts.push(first);
      }
      if (fonts.length >= 12) return fonts;
    }
  }
  return fonts;
}

// Pretty-printed DOM serialization for before/after diffing. One tag per line,
// children indented. data-ds-ref is stripped (session-local noise), script/
// style bodies elided. Stamps React component names as data-react-component
// during the walk; cleans up afterward.
const SNAP_SKIP_ATTRS = new Set([
  'data-ds-ref',
  'data-ds-component-ref',
  'data-ds-component-preview',
  'contenteditable',
]);
const SNAP_ELIDE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function snapSerialize(el, depth, out, nameMap) {
  const ind = '  '.repeat(depth);
  const tag = el.tagName.toLowerCase();
  let open = `${ind}<${tag}`;
  for (const a of el.attributes) {
    if (SNAP_SKIP_ATTRS.has(a.name)) continue;
    const v = a.value.replace(/"/g, '&quot;').replace(/\n/g, ' ');
    open += ` ${a.name}="${v}"`;
  }
  const rn = nameMap.get(el);
  if (rn) open += ` data-react-component="${rn}"`;
  open += '>';
  out.push(open);
  if (SNAP_ELIDE_TAGS.has(el.tagName)) {
    out.push(`${ind}  …`);
  } else {
    for (const c of el.childNodes) {
      if (c.nodeType === 1) snapSerialize(c, depth + 1, out, nameMap);
      else if (c.nodeType === 3) {
        const t = c.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push(`${ind}  ${t}`);
      }
    }
  }
  out.push(`${ind}</${tag}>`);
}

export function snapshotDom() {
  const roots = scanRoots();
  if (!roots.length) return '';
  // Build a name map without touching the DOM. Cap at 4000 nodes — past that
  // the fiber walk dominates and a labeled snapshot stops being diff-useful
  // anyway. Stamping attributes here would fire body MutationObservers ~2*N
  // times (set + unset) and race React commits on slow snapshots.
  const nameMap = new Map();
  for (const root of roots) {
    const all = root.querySelectorAll('*');
    const n = Math.min(all.length, 4000);
    for (let i = 0; i < n; i += 1) {
      const rn = reactName(all[i]);
      if (rn) nameMap.set(all[i], rn);
    }
  }
  const lines = [];
  for (const root of roots) snapSerialize(root, 0, lines, nameMap);
  return lines.join('\n');
}
