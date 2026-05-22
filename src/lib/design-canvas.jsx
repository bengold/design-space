import React from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Expand, MoreHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  // Bumped from rgba(60,50,40,0.7) → ≥4.5:1 against bg for WCAG AA.
  label: 'rgba(40,30,20,0.85)',
  title: 'rgba(40,30,20,0.92)',
  // Subtitle is body-sized copy, so it also needs AA against the warm bg.
  subtitle: 'rgba(40,30,20,0.78)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = [
    '.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}',
    '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}',
    '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}',
    '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}',
    '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
    // isolation:isolate contains artboard content's z-indexes so a
    // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
    // the .dc-menu popover that drops into the top of the card.
    '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}',
    '.dc-card *{scrollbar-width:none}',
    '.dc-card *::-webkit-scrollbar{display:none}',
    // Per-artboard header: grip + label on the left, delete/expand on the
    // right. Single flex row; when the artboard's on-screen width is too
    // narrow for both the label yields (ellipsis, then hidden entirely below
    // ~4ch via the container query) and the buttons stay on the row.
    '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;',
    '  display:flex;align-items:center;container-type:inline-size}',
    '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}',
    '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;border:0;background:transparent;color:inherit;transition:background .12s,opacity .12s}',
    '.dc-grip:hover{background:rgba(0,0,0,.08)}',
    '.dc-grip:active{cursor:grabbing}',
    // Focus rings use the --ring design token so canvas chrome matches the
    // host toolbar instead of hard-coding Claude orange.
    '.dc-grip:focus-visible{outline:2px solid var(--ring);outline-offset:1px;background:rgba(0,0,0,.06)}',
    '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;',
    '  display:flex;align-items:center;transition:background .12s;overflow:hidden;',
    '  background:transparent;border:0;color:inherit;text-align:left;font:inherit}',
    '.dc-labeltext:focus-visible{outline:2px solid var(--ring);outline-offset:1px}',
    // Below ~4ch of label room: hide the label entirely, and drop the grip to
    // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
    // until the card is moused. :focus-within reveals so keyboard users can
    // still reach them.
    '@container (max-width: 110px){',
    '  .dc-labeltext{display:none}',
    '  .dc-grip{opacity:0}',
    '  [data-dc-slot]:hover .dc-grip,[data-dc-slot]:focus-within .dc-grip{opacity:1}',
    '  [data-dc-slot]:focus-within .dc-labeltext{display:flex}',
    '}',
    '.dc-labeltext:hover{background:rgba(0,0,0,.05)}',
    '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}',
    '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}',
    '[data-dc-slot]:hover .dc-btns,[data-dc-slot]:focus-within .dc-btns,.dc-btns[data-menu-open="true"]{opacity:1}',
    // Header icon buttons get a transparent ghost look matching the warm-gray
    // chrome palette; the shadcn Button base supplies focus rings + sizing.
    '.dc-header [data-slot="button"]{color:rgba(60,50,40,.7);background:transparent;border:none}',
    '.dc-header [data-slot="button"]:hover{background:rgba(0,0,0,.06);color:#2a251f}',
    '.dc-header [data-slot="button"][aria-expanded="true"]{background:rgba(0,0,0,.08);color:#2a251f}',
    // Chrome (titles / labels / buttons) counter-scales against the viewport
    // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
    // DCViewport on every transform update and inherits to all descendants —
    // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
    // it the same way.
    //
    // The header uses transform:scale (out-of-flow, so layout impact doesn't
    // matter) with its world-space width set to card-width / inv-zoom so that
    // after counter-scaling its on-screen width exactly matches the card's —
    // that's what lets the container query + text-overflow behave against the
    // card's visible edge at every zoom level.
    //
    // The section head uses CSS zoom instead of transform so its layout box
    // grows with the counter-scale, pushing the card row down — otherwise the
    // constant-screen-size title would overflow into the (shrinking) world-
    // space gap and overlap the artboard headers at low zoom.
    '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));',
    '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}',
    '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}',
  ].join('\n');
  document.head.appendChild(s);
}

const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, (c) => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));
    else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';

// DCPage — top-level grouping inside <DesignCanvas>. Each page has its own
// content; only the active page is rendered. The component itself is a no-op
// — DesignCanvas walks the children to find pages.
//
// Two flavors:
//
//   1. Canvas pages (default) — children are DCSections of DCArtboards. The
//      page renders inside the pan/zoom DCViewport with the usual canvas
//      chrome (grid, section titles, draggable artboards).
//
//        <DCPage id="onboarding" title="Onboarding">
//          <DCSection id="flow" title="Onboarding"><DCArtboard…/></DCSection>
//        </DCPage>
//
//   2. Raw pages (`raw`) — children render directly, no canvas, no pan/zoom.
//      Use for full-screen showcases, interactive demos, or anything where
//      the infinite canvas would get in the way.
//
//        <DCPage id="cards" title="Cards" raw>
//          <IridescentCardShowcase />
//        </DCPage>
//
// The agent picks per page — canvas for multi-artboard mockups, raw for
// standalone screens. Both styles can coexist in one design.
function DCPage({ children }) {
  return children;
}

function DesignCanvas({ children, minScale, maxScale, style }) {
  const [state, setState] = React.useState({ sections: {}, focus: null });

  // Multi-page mode kicks in as soon as any DCPage children appear. Single-page
  // (legacy) is the default — DCSection children are treated as the implicit
  // "main" page.
  const childList = dcFlatten(children);
  const pageNodes = childList.filter((c) => c && c.type === DCPage);
  const isMultiPage = pageNodes.length > 0;

  const pageKey = `dc-active-page:${typeof location !== 'undefined' ? location.pathname : '/'}`;
  const [activePageId, setActivePageId] = React.useState(() => {
    if (!isMultiPage) return null;
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem(pageKey);
      if (saved && pageNodes.find((p) => p.props.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return pageNodes[0]?.props.id ?? null;
  });

  React.useEffect(() => {
    if (!isMultiPage || !activePageId) return;
    try {
      localStorage.setItem(pageKey, activePageId);
    } catch {
      /* ignore */
    }
  }, [activePageId, isMultiPage, pageKey]);

  // If the JSX no longer contains the persisted active page (renamed/removed),
  // snap to the first available page so the canvas doesn't render empty.
  React.useEffect(() => {
    if (!isMultiPage) return;
    if (!pageNodes.find((p) => p.props.id === activePageId)) {
      setActivePageId(pageNodes[0]?.props.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiPage, pageNodes.map((p) => p.props.id).join('|')]);

  // Cycle pages with Cmd+] / Cmd+[ (matching Figma). Ignored when focus is in
  // editable content.
  React.useEffect(() => {
    if (!isMultiPage) return undefined;
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.altKey) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key !== ']' && e.key !== '[') return;
      e.preventDefault();
      const ids = pageNodes.map((p) => p.props.id);
      const idx = ids.indexOf(activePageId);
      if (idx < 0) return;
      const next = e.key === ']' ? (idx + 1) % ids.length : (idx - 1 + ids.length) % ids.length;
      setActivePageId(ids[next]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMultiPage, activePageId, pageNodes]);

  // Sync the page list + active page up to the host, and accept page changes
  // back. The host renders the picker in its toolbar; this iframe is the source
  // of truth for the list because pages are declared in Design.jsx.
  React.useEffect(() => {
    if (!isMultiPage) return undefined;
    const pages = pageNodes.map((p) => ({ id: p.props.id, title: p.props.title ?? p.props.id }));
    try {
      window.parent.postMessage({ type: '__dc_pages', pages, active: activePageId }, '*');
    } catch {
      /* ignore */
    }
    const onMsg = (e) => {
      const d = e.data;
      if (
        d?.type === '__dc_set_active_page' &&
        d.id &&
        pageNodes.find((p) => p.props.id === d.id)
      ) {
        setActivePageId(d.id);
      } else if (d?.type === '__dc_request_pages') {
        // Host re-mounted (iframe reload). Re-post.
        try {
          window.parent.postMessage({ type: '__dc_pages', pages, active: activePageId }, '*');
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [isMultiPage, activePageId, pageNodes]);

  // What actually renders: the active page's children in multi-page mode,
  // otherwise the original children. Track the active page so we can skip
  // the canvas chrome on `raw` pages.
  const activePage = isMultiPage
    ? (pageNodes.find((p) => p.props.id === activePageId) ?? null)
    : null;
  const isRawPage = activePage?.props.raw === true;
  const renderedChildren = isMultiPage ? (activePage?.props.children ?? null) : children;
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);

  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (off || !saved || !saved.sections) return;
        skipNextWrite.current = true;
        setState((s) => ({ ...s, sections: saved.sections }));
      })
      .catch(() => {})
      .finally(() => {
        didRead.current = true;
        if (!off) setReady(true);
      });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);

  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      writeDesignState(DC_STATE_FILE, JSON.stringify({ sections: state.sections })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Section registry — each DCSection reports its raw artboards into here
  // via useLayoutEffect on mount/update. We can't walk `renderedChildren`
  // for DCSections directly because pages frequently wrap them in custom
  // components (e.g. <OnboardingPage>), which the JSX walk can't see
  // through. Latest element refs live in `sectionsRef` (no re-render); only
  // id/meta changes bump `registrationsVersion` to trigger derivation.
  const sectionsRef = React.useRef({}); // { sid: { meta: {title, subtitle}, artboards: [[aid, ab], ...] } }
  const sectionOrderRef = React.useRef([]); // sid insertion order
  const [registrationsVersion, setRegistrationsVersion] = React.useState(0);

  const registerSection = React.useCallback((sid, meta, artboards) => {
    const prev = sectionsRef.current[sid];
    const newIdsStr = artboards.map(([k]) => k).join('\x1f');
    const oldIdsStr = prev?.artboards.map(([k]) => k).join('\x1f');
    // Always refresh element refs so the focus overlay renders the latest
    // children (tweaks, hot-reload, etc.).
    sectionsRef.current[sid] = { meta, artboards };
    if (!sectionOrderRef.current.includes(sid)) sectionOrderRef.current.push(sid);
    // Only force a re-render when id-set or meta changed — element identity
    // alone changes every render and would loop.
    if (
      !prev ||
      oldIdsStr !== newIdsStr ||
      prev.meta.title !== meta.title ||
      prev.meta.subtitle !== meta.subtitle
    ) {
      setRegistrationsVersion((v) => v + 1);
    }
  }, []);

  const unregisterSection = React.useCallback((sid) => {
    if (!(sid in sectionsRef.current)) return;
    delete sectionsRef.current[sid];
    sectionOrderRef.current = sectionOrderRef.current.filter((s) => s !== sid);
    setRegistrationsVersion((v) => v + 1);
  }, []);

  // Derive registry / sectionMeta / sectionOrder from the live registrations
  // and the persisted hidden/order/title in `state.sections`. Skipped on raw
  // pages — they have no DCSections.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  if (!isRawPage) {
    // registrationsVersion read for re-derivation; underlying data lives in
    // refs so we can keep element identity fresh without a render loop.
    void registrationsVersion;
    for (const sid of sectionOrderRef.current) {
      const reg = sectionsRef.current[sid];
      if (!reg) continue;
      sectionOrder.push(sid);
      const persisted = state.sections[sid] || {};
      const abs = reg.artboards;
      const srcKey = abs.map(([k]) => k).join('\x1f');
      const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
      const srcIds = [];
      abs.forEach(([aid, ab]) => {
        if (hidden.includes(aid)) return;
        registry[`${sid}/${aid}`] = { sectionId: sid, artboard: ab };
        srcIds.push(aid);
      });
      const kept = (persisted.order || []).filter((k) => srcIds.includes(k));
      sectionMeta[sid] = {
        title: persisted.title ?? reg.meta.title,
        subtitle: reg.meta.subtitle,
        slotIds: [...kept, ...srcIds.filter((k) => !kept.includes(k))],
      };
    }
  }

  const api = React.useMemo(
    () => ({
      state,
      section: (id) => state.sections[id] || {},
      patchSection: (id, p) =>
        setState((s) => ({
          ...s,
          sections: {
            ...s.sections,
            [id]: { ...s.sections[id], ...(typeof p === 'function' ? p(s.sections[id] || {}) : p) },
          },
        })),
      setFocus: (slotId) => setState((s) => ({ ...s, focus: slotId })),
      registerSection,
      unregisterSection,
    }),
    [state, registerSection, unregisterSection],
  );

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = (e) => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);

  return (
    <DCCtx.Provider value={api}>
      {isRawPage ? (
        // Raw page — bypass the pan/zoom canvas entirely. Children render
        // full-viewport. Used for standalone showcases / full-screen demos
        // where the canvas chrome would just be in the way.
        //
        // `data-dc-slot` is set to the page id so that elementContext.js
        // treats the whole raw page as a single "artboard" — Edit/Comment
        // picking, ensureDsRef path-building, and isReviewTarget all key off
        // [data-dc-slot]. Without it, clicks on raw-page elements are
        // silently ignored.
        //
        // Deliberately NO `.design-canvas` class — that's the scoping
        // selector for canvas-wide overrides (background/font/text color),
        // which are meaningless on raw pages. `data-dc-page-raw` is the
        // detection marker the edit panel uses to hide the Canvas controls.
        <div
          data-dc-slot={activePage?.props.id}
          data-dc-page-raw=""
          style={{
            width: '100vw',
            height: '100vh',
            overflow: 'auto',
            boxSizing: 'border-box',
            background: DC.bg,
          }}
        >
          {ready && renderedChildren}
        </div>
      ) : (
        <DCViewport minScale={minScale} maxScale={maxScale} style={style}>
          {ready && renderedChildren}
        </DCViewport>
      )}
      {!isRawPage && state.focus && registry[state.focus] && (
        <DCFocusOverlay
          entry={registry[state.focus]}
          sectionMeta={sectionMeta}
          sectionOrder={sectionOrder}
        />
      )}
    </DCCtx.Provider>
  );
}

// DCPagePicker — floating page menu at the top of the viewport. Uses a
// DropdownMenu so it scales gracefully to dozens of pages. position:fixed
// keeps it out of the pan/zoom transform.
function DCPagePicker({ pages, active, onChange }) {
  const current = pages.find((p) => p.id === active) ?? pages[0];
  const idx = pages.findIndex((p) => p.id === active);
  return (
    <div
      data-noncommentable=""
      className="ds-review-ui"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        userSelect: 'none',
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="!bg-background/85 !backdrop-blur"
              title={`Switch page (⌘[ / ⌘]) — ${idx + 1} of ${pages.length}`}
            >
              <span className="text-foreground">{current?.title ?? '—'}</span>
              <ChevronDown data-icon="inline-end" />
            </Button>
          }
        />
        <DropdownMenuContent align="center" className="min-w-[200px]">
          {pages.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onChange(p.id)}
              data-active={p.id === active || undefined}
              className="data-[active]:bg-muted data-[active]:font-medium"
            >
              {p.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({ children, minScale = 0.1, maxScale = 8, style = {} }) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({ x: 0, y: 0, scale: 1 });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);

  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const { x, y, scale } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({ type: '__dc_zoom', scale }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);

  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = { x: s.x, y: s.y, scale: Math.min(maxScale, Math.max(minScale, s.scale)) };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;

    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = (e) =>
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);

    const onWheel = (e) => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = (e) => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, (gsBase * e.scale) / tf.current.scale);
    };
    const onGestureEnd = (e) => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = (e) => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || (e.button === 0 && onBg))) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // "Fit to screen" — finds the bounding box of every artboard and re-frames
    // the viewport so all of them are visible with a small screen-space margin.
    // Used by the host toolbar's recenter button and the `1` keyboard shortcut.
    const fitToScreen = () => {
      const world = worldRef.current;
      if (!world) return;
      const slots = world.querySelectorAll('[data-dc-slot]');
      const t = tf.current;
      const vpRect = vp.getBoundingClientRect();
      if (!slots.length) {
        tf.current = { x: 0, y: 0, scale: 1 };
        apply();
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const slot of slots) {
        const r = slot.getBoundingClientRect();
        // Map screen → world (undo the current transform).
        const wx0 = (r.left - vpRect.left - t.x) / t.scale;
        const wy0 = (r.top - vpRect.top - t.y) / t.scale;
        const wx1 = (r.right - vpRect.left - t.x) / t.scale;
        const wy1 = (r.bottom - vpRect.top - t.y) / t.scale;
        if (wx0 < minX) minX = wx0;
        if (wy0 < minY) minY = wy0;
        if (wx1 > maxX) maxX = wx1;
        if (wy1 > maxY) maxY = wy1;
      }
      const pad = 60; // px in screen space
      const worldW = Math.max(1, maxX - minX);
      const worldH = Math.max(1, maxY - minY);
      const scale = Math.min(
        maxScale,
        Math.max(
          minScale,
          Math.min((vpRect.width - pad * 2) / worldW, (vpRect.height - pad * 2) / worldH),
        ),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      tf.current = {
        x: vpRect.width / 2 - cx * scale,
        y: vpRect.height / 2 - cy * scale,
        scale,
      };
      apply();
    };

    // Cmd+1 / Ctrl+1 → fit to screen; Cmd+0 / Ctrl+0 → 100%. Matches Figma's
    // convention. Modifier required so plain `1`/`0` typing inside artboard
    // content isn't hijacked.
    const onKey = (e) => {
      const target = e.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.shiftKey || e.altKey) return;
      if (e.key === '1') {
        e.preventDefault();
        fitToScreen();
      } else if (e.key === '0') {
        e.preventDefault();
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / tf.current.scale);
      }
    };
    window.addEventListener('keydown', onKey);

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = (e) => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_fit_to_screen') {
        fitToScreen();
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({ type: '__dc_present' }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({ type: '__dc_present' }, '*');
    lastPostedScale.current = undefined;
    apply();

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('gesturestart', onGestureStart, { passive: false });
    vp.addEventListener('gesturechange', onGestureChange, { passive: false });
    vp.addEventListener('gestureend', onGestureEnd, { passive: false });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      window.removeEventListener('keydown', onKey);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);

  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return (
    <div
      ref={vpRef}
      className="design-canvas"
      style={{
        height: '100vh',
        width: '100vw',
        background: DC.bg,
        overflow: 'hidden',
        overscrollBehavior: 'none',
        touchAction: 'none',
        position: 'relative',
        fontFamily: DC.font,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        ref={worldRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          willChange: 'transform',
          width: 'max-content',
          minWidth: '100%',
          minHeight: '100%',
          padding: '60px 0 80px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -6000,
            backgroundImage: gridSvg,
            backgroundSize: '120px 120px',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({ id, title, subtitle, children, gap = 48 }) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter((c) => c && c.type === DCArtboard);
  const rest = all.filter((c) => !(c && c.type === DCArtboard));
  const sec = (ctx && sid && ctx.section(sid)) || {};

  // Self-register with DesignCanvas so the focus overlay can resolve
  // `${sid}/${aid}` slot ids even when this section sits inside a custom
  // page component (which the parent's JSX walk can't see through).
  // Runs every render to keep the latest artboard element refs in the
  // registry — `registerSection` short-circuits the re-render trigger
  // unless the id-set or title/subtitle actually changed.
  React.useLayoutEffect(() => {
    if (!ctx?.registerSection || !sid) return;
    const list = artboards
      .map((a) => [a.props.id ?? a.props.label, a])
      .filter(([k]) => k);
    ctx.registerSection(sid, { title, subtitle }, list);
  });
  // Cleanup on unmount / sid change only.
  React.useLayoutEffect(() => {
    return () => ctx?.unregisterSection?.(sid);
  }, [ctx, sid]);
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map((a) => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter((k) => !hidden.includes(k));

  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter((k) => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter((k) => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);

  const byId = Object.fromEntries(artboards.map((a) => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return (
    <div
      data-dc-section={sid}
      style={{ marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))', position: 'relative' }}
    >
      <div style={{ padding: '0 60px' }}>
        <div className="dc-sectionhead" style={{ paddingBottom: 36 }}>
          <DCEditable
            tag="div"
            value={sec.title ?? title}
            onChange={(v) => ctx && sid && ctx.patchSection(sid, { title: v })}
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: DC.title,
              letterSpacing: -0.4,
              marginBottom: 6,
              display: 'inline-block',
            }}
          />
          {subtitle && <div style={{ fontSize: 16, color: DC.subtitle }}>{subtitle}</div>}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          gap,
          padding: '0 60px',
          alignItems: 'flex-start',
          width: 'max-content',
        }}
      >
        {order.map((k) => (
          <DCArtboardFrame
            key={k}
            sectionId={sid}
            artboard={byId[k]}
            order={order}
            label={(sec.labels || {})[k] ?? byId[k].props.label}
            onRename={(v) =>
              ctx && ctx.patchSection(sid, (x) => ({ labels: { ...x.labels, [k]: v } }))
            }
            onReorder={(next) => ctx && ctx.patchSection(sid, { order: next })}
            onDelete={() =>
              ctx &&
              ctx.patchSection(sid, (x) => ({
                hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
                srcKey,
              }))
            }
            onFocus={() => ctx && ctx.setFocus(`${sid}/${k}`)}
          />
        ))}
      </div>
      {rest}
    </div>
  );
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = (url) =>
    fetch(url)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = () => res(url);
            fr.readAsDataURL(b);
          }),
      )
      .catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = (href) => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(
      fetch(href)
        .then((r) => r.text())
        .then((css) => {
          for (const m of css.match(/@font-face\s*{[^}]*}/g) || [])
            fontRules.push({ css: m, base: href });
          for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g))
            scrapeCss(new URL(m[1], href).href);
        })
        .catch(() => {}),
    );
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({ css: r.cssText, base });
      else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (
    await Promise.all(
      fontRules.map(async (rule) => {
        let out = rule.css,
          m;
        const re = /url\((['"]?)([^'")]+)\1\)/g;
        while ((m = re.exec(rule.css))) {
          if (m[2].indexOf('data:') === 0) continue;
          let abs;
          try {
            abs = new URL(m[2], rule.base).href;
          } catch {
            continue;
          }
          out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
        }
        return out;
      }),
    )
  ).join('\n');

  const cloneStyled = (src) => {
    if (src.nodeType === 8 || (src.nodeType === 1 && src.tagName === 'SCRIPT'))
      return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS')
        try {
          const im = document.createElement('img');
          im.src = src.toDataURL();
          im.setAttribute('style', txt);
          return im;
        } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';

  const jobs = [];
  clone.querySelectorAll('img').forEach((el) => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0)
      jobs.push(toDataURL(el.src).then((d) => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach((el) => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while ((m = re.exec(bg))) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(
        toDataURL(url).then((d) => {
          el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
        }),
      );
    }
  });
  await Promise.all(jobs);

  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (kind === 'html') {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
      name +
      '</title>' +
      (fontCss ? '<style>' + fontCss + '</style>' : '') +
      '</head><body style="margin:0">' +
      xml +
      '</body></html>';
    return save(new Blob([html], { type: 'text/html' }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    w * px +
    '" height="' +
    h * px +
    '" viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '"><foreignObject width="' +
    w +
    '" height="' +
    h +
    '">' +
    (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') +
    xml +
    '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob((blob) => save(blob, 'png'), 'image/png');
}

function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete,
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {},
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // Two-click delete: first click arms, second commits. Resetting on close
  // means reopening the menu starts disarmed.
  React.useEffect(() => {
    if (!menuOpen) setConfirming(false);
  }, [menuOpen]);

  const doExport = (kind) => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch((e) =>
      console.error('[design-canvas] export failed:', e),
    );
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(
      document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`),
    );
    const homes = peers.map((el) => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left,
    }));
    const slotXs = homes.map((h) => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');

    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };

    const move = (ev) => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter((k) => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            for (const h of homes) h.el.style.transition = '';
          }),
        );
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  return (
    <div ref={ref} data-dc-slot={id} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        className="dc-header"
        data-noncommentable=""
        style={{ color: DC.label }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="dc-labelrow">
          <button
            type="button"
            className="dc-grip"
            onPointerDown={onGripDown}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              if (!onReorder) return;
              const i = order.indexOf(id);
              const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
              if (i < 0 || j < 0 || j >= order.length) return;
              e.preventDefault();
              const next = order.slice();
              [next[i], next[j]] = [next[j], next[i]];
              onReorder(next);
            }}
            aria-label={`Reorder artboard ${label}. Use Left or Right arrow to move, or drag.`}
            title="Drag to reorder (Left/Right arrow with keyboard)"
          >
            <svg aria-hidden width="9" height="13" viewBox="0 0 9 13" fill="currentColor">
              <circle cx="2" cy="2" r="1.1" />
              <circle cx="7" cy="2" r="1.1" />
              <circle cx="2" cy="6.5" r="1.1" />
              <circle cx="7" cy="6.5" r="1.1" />
              <circle cx="2" cy="11" r="1.1" />
              <circle cx="7" cy="11" r="1.1" />
            </svg>
          </button>
          {/* Labeltext: clicking the row focuses the artboard, but the inline
              editable inside is its own interactive — so this is role="button"
              with Enter handler rather than a real <button> (which can't
              legally contain another interactive). */}
          <div
            className="dc-labeltext"
            role="button"
            tabIndex={0}
            onClick={onFocus}
            onKeyDown={(e) => {
              // Don't steal Enter/Space while editing the inline name.
              if (e.target?.isContentEditable) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onFocus?.();
              }
            }}
            aria-label={`Focus artboard ${label}`}
            title="Click to focus"
          >
            <DCEditable
              value={label}
              onChange={onRename}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 15, fontWeight: 500, color: DC.label, lineHeight: 1 }}
            />
          </div>
        </div>
        <TooltipProvider delay={300}>
          <div className="dc-btns" data-menu-open={menuOpen || undefined}>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-xs" aria-label="More">
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                  }
                />
                <TooltipContent>More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={() => doExport('png')}>Download PNG</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('html')}>Download HTML</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  closeOnClick={false}
                  onClick={() => {
                    if (confirming) {
                      setMenuOpen(false);
                      onDelete();
                    } else {
                      setConfirming(true);
                    }
                  }}
                >
                  {confirming ? 'Click again to delete' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                onClick={onFocus}
                render={
                  <Button variant="ghost" size="icon-xs" aria-label="Focus">
                    <Expand />
                  </Button>
                }
              />
              <TooltipContent>Focus</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
      <div
        ref={cardRef}
        className="dc-card"
        style={{
          borderRadius: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
          overflow: 'hidden',
          width,
          height,
          background: '#fff',
          ...style,
        }}
      >
        {children || (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#bbb',
              fontSize: 13,
              fontFamily: DC.font,
            }}
          >
            {id}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline rename — commits on blur or Enter.
function DCEditable({ value, onChange, style, tag = 'span', onClick }) {
  const T = tag;
  return (
    <T
      className="dc-editable"
      contentEditable
      suppressContentEditableWarning
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onChange && onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      style={style}
    >
      {value}
    </T>
  );
}

function DCFocusArrow({ dir, label, onClick }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="absolute top-1/2 size-11 -translate-y-1/2 rounded-full border-none bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
            style={{ [dir]: 28 }}
          >
            {dir === 'left' ? (
              <ChevronLeft className="size-[18px]" />
            ) : (
              <ChevronRight className="size-[18px]" />
            )}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({ entry, sectionMeta, sectionOrder }) {
  console.log('[focus-debug] DCFocusOverlay rendering', {
    entrySection: entry?.sectionId,
    entryArtId: entry?.artboard?.props?.id,
    sectionOrder,
    sectionMetaKeys: Object.keys(sectionMeta || {}),
  });
  const ctx = React.useContext(DCCtx);
  const { sectionId, artboard } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);

  const go = React.useCallback(
    (d) => {
      const n = peers[(idx + d + peers.length) % peers.length];
      if (n) ctx.setFocus(`${sectionId}/${n}`);
    },
    [peers, idx, ctx, sectionId],
  );
  const goSection = React.useCallback(
    (d) => {
      // Sections whose artboards are all deleted have slotIds:[] — step past
      // them to the next non-empty section so ↑/↓ doesn't dead-end.
      const n = sectionOrder.length;
      for (let i = 1; i < n; i++) {
        const ns = sectionOrder[(((secIdx + d * i) % n) + n) % n];
        const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
        if (first) {
          ctx.setFocus(`${ns}/${first}`);
          return;
        }
      }
    },
    [sectionOrder, sectionMeta, secIdx, ctx],
  );

  React.useEffect(() => {
    const k = (e) => {
      // Don't hijack arrow keys when focus is in an input / editable text.
      const t = e.target;
      if (
        t &&
        (t.matches?.('input, textarea, select, [contenteditable="true"]') || t.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [go, goSection]);

  const { width = 260, height = 480, children } = artboard.props;
  const [vp, setVp] = React.useState({ w: window.innerWidth, h: window.innerHeight });
  React.useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));

  const [ddOpen, setDd] = React.useState(false);

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(
    <TooltipProvider delay={300}>
      <div
        onClick={() => ctx.setFocus(null)}
        onWheel={(e) => e.preventDefault()}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(24,20,16,.6)',
          backdropFilter: 'blur(14px)',
          fontFamily: DC.font,
          color: '#fff',
        }}
      >
        {/* top bar: section dropdown (left) · close (right) */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 72,
            display: 'flex',
            alignItems: 'flex-start',
            padding: '16px 20px 0',
            gap: 16,
          }}
        >
          <DropdownMenu open={ddOpen} onOpenChange={setDd}>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="cursor-pointer rounded-md border-none bg-transparent px-2 py-1.5 text-left font-[inherit] text-white outline-none hover:bg-white/10 focus-visible:bg-white/10 aria-expanded:bg-white/10"
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
                      {meta.title}
                    </span>
                    <ChevronDown className="size-[11px] opacity-70" strokeWidth={1.8} />
                  </span>
                  {meta.subtitle && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        opacity: 0.6,
                        fontWeight: 400,
                        marginTop: 2,
                      }}
                    >
                      {meta.subtitle}
                    </span>
                  )}
                </button>
              }
            />
            <DropdownMenuContent align="start" sideOffset={4} className="min-w-[200px]">
              {sectionOrder
                .filter((sid) => sectionMeta[sid].slotIds.length)
                .map((sid) => (
                  <DropdownMenuItem
                    key={sid}
                    onClick={() => {
                      const f = sectionMeta[sid].slotIds[0];
                      if (f) ctx.setFocus(`${sid}/${f}`);
                    }}
                    className={sid === sectionId ? 'font-semibold' : undefined}
                  >
                    {sectionMeta[sid].title}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div style={{ flex: 1 }} />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close focus mode"
                  onClick={() => ctx.setFocus(null)}
                  className="size-8 rounded-full border-none bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <X />
                </Button>
              }
            />
            <TooltipContent>Close (Esc)</TooltipContent>
          </Tooltip>
        </div>

        {/* card centered, label + index below — only the card itself stops
          propagation so any backdrop click (including the margins around
          the card) exits focus */}
        <div
          style={{
            position: 'absolute',
            top: 64,
            bottom: 56,
            left: 100,
            right: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: width * scale, height: height * scale, position: 'relative' }}
          >
            <div
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                background: '#fff',
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: '0 20px 80px rgba(0,0,0,.4)',
              }}
            >
              {children || (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#bbb',
                  }}
                >
                  {aid}
                </div>
              )}
            </div>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 14, fontWeight: 500, opacity: 0.85, textAlign: 'center' }}
          >
            {(sec.labels || {})[aid] ?? artboard.props.label}
            <span style={{ opacity: 0.5, marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>
              {idx + 1} / {peers.length}
            </span>
          </div>
        </div>

        <DCFocusArrow dir="left" label="Previous artboard" onClick={() => go(-1)} />
        <DCFocusArrow dir="right" label="Next artboard" onClick={() => go(1)} />

        {/* dots — small visual indicator, 24×24 invisible hit area for AA touch */}
        <div
          role="tablist"
          aria-label="Artboards in this section"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 4,
          }}
        >
          {peers.map((p, i) => {
            const peerLabel = ctx?.section?.(sectionId)?.labels?.[p] ?? p;
            const isActive = i === idx;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Go to artboard ${i + 1} of ${peers.length}: ${peerLabel}`}
                onClick={() => ctx.setFocus(`${sectionId}/${p}`)}
                style={{
                  border: 'none',
                  padding: 9,
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 12,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = '2px solid #fff';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = '';
                  e.currentTarget.style.outlineOffset = '';
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'block',
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: isActive ? '#fff' : 'rgba(255,255,255,.4)',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({ children, top, left, right, bottom, rotate = -2, width = 180 }) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        width,
        background: DC.postitBg,
        padding: '14px 16px',
        fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
        fontSize: 14,
        lineHeight: 1.4,
        color: DC.postitText,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
        transform: `rotate(${rotate}deg)`,
        zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

async function writeDesignState(file, content) {
  if (typeof window !== 'undefined' && window.omelette?.writeFile) {
    return window.omelette.writeFile(file, content);
  }
  await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: file, content }),
  });
}

export { DesignCanvas, DCPage, DCSection, DCArtboard, DCPostIt, DCEditable };
