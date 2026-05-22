import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { autoUpdate } from '@floating-ui/dom';
import { useFloating, offset as offsetMiddleware, flip, shift } from '@floating-ui/react';
import { Send, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { filterOpenComments } from '../../lib/comment-utils.mjs';
import {
  deleteComment,
  persistCommentsBundle,
  sendCommentToAgent,
  updateCommentText,
} from './comment-actions.js';
import { stylesToCssRule } from './css-property-schema.js';
import { EditPanel } from './edit-panel.jsx';
import { findReactComponentElements, resolveDsRef, snapshotDom } from './elementContext.js';
import { appendReviewEvent } from './review-events.js';
import { useSelectionPicker } from './selection-picker.jsx';
import { fetchDesignJson, writeDesignFile } from '../preview/persistDesignFile.js';

const ReviewCtx = createContext(null);
export function useDesignReview() {
  return useContext(ReviewCtx);
}

async function persistOverrides(designName, byRef, canvas, components = {}) {
  await writeDesignFile(`designs/${designName}/overrides.json`, {
    byRef,
    canvas: canvas || {},
    components,
  });
}

function componentToken(key) {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33) ^ key.charCodeAt(i);
  return `c${(hash >>> 0).toString(36)}`;
}

function selectorRule(selector, { styles = {}, cssText = '' }) {
  const decl = Object.entries(styles)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v} !important`)
    .join(';');
  const extra = cssText?.trim() ? cssText.trim().replace(/\s+/g, ' ') : '';
  const body = [decl, extra].filter(Boolean).join(';');
  return body ? `${selector}{${body}}` : '';
}

// Throttle DOM-snapshot writes so rapid keystrokes in the edit panel don't
// hammer /api/write. Trailing edge ensures the last snapshot in a burst
// always lands on disk.
const SNAPSHOT_DEBOUNCE_MS = 800;
let snapshotTimer = null;
let snapshotPendingName = null;
function scheduleDomSnapshot(designName) {
  snapshotPendingName = designName;
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    snapshotTimer = null;
    const name = snapshotPendingName;
    if (!name) return;
    try {
      const text = snapshotDom();
      if (text) await writeDesignFile(`designs/${name}/dom-snapshot.txt`, text);
    } catch {
      /* best-effort — losing a snapshot is recoverable on next edit */
    }
  }, SNAPSHOT_DEBOUNCE_MS);
}

function commentContexts(comment) {
  if (comment.contexts?.length) return comment.contexts;
  if (comment.context) return [comment.context];
  return [];
}

function canvasRule(canvas) {
  if (!canvas) return '';
  const decl = Object.entries(canvas)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    // `!important` beats DesignCanvas's own inline `fontFamily`/`background`
    // declarations on the .design-canvas element (inline > rule specificity
    // otherwise). Per-element overrides — [data-ds-ref="X"]{…} — still win
    // for their own descendants because they're set directly on the element
    // rather than inherited.
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v} !important`)
    .join(';');
  // Scope to `.design-canvas` only. Inherited properties (font-family,
  // font-size, color) flow into every artboard via normal CSS inheritance,
  // and non-inherited ones (background-color) stay on the canvas surface.
  // The Sheet/popover chrome lives at the body level — a body/:root rule
  // would cascade into the edit panel itself, which is the bug we hit earlier.
  return decl ? `.design-canvas{${decl}}` : '';
}

function OverridesInjector({ byRef, canvas, components }) {
  const css = useMemo(() => {
    const perRef = Object.entries(byRef || {})
      .map(([ref, o]) => stylesToCssRule(ref, o))
      .filter(Boolean)
      .join('\n');
    const perComponent = Object.entries(components || {})
      .map(([key, o]) =>
        selectorRule(`[data-ds-component-ref~="${CSS.escape(componentToken(key))}"]`, o),
      )
      .filter(Boolean)
      .join('\n');
    const rootRule = canvasRule(canvas);
    return [rootRule, perRef, perComponent].filter(Boolean).join('\n');
  }, [byRef, canvas, components]);

  // Resolve each saved ref to its element via the structural path and stamp the
  // data-ds-ref attribute back on so the CSS rule matches on a fresh page load.
  // Then imperatively apply any saved textContent (guarded against destroying
  // child structure).
  useEffect(() => {
    document.querySelectorAll('[data-ds-component-ref]').forEach((el) => {
      el.removeAttribute('data-ds-component-ref');
    });
    for (const [key, o] of Object.entries(components || {})) {
      const token = componentToken(key);
      const matches = findReactComponentElements(o.component);
      for (const el of matches) {
        const existing = el.getAttribute('data-ds-component-ref');
        const next = existing ? `${existing} ${token}` : token;
        el.setAttribute('data-ds-component-ref', next);
      }
    }
    for (const [ref, o] of Object.entries(byRef || {})) {
      let el = document.querySelector(`[data-ds-ref="${CSS.escape(ref)}"]`);
      if (!el) {
        el = resolveDsRef(ref);
        if (el) el.dataset.dsRef = ref;
      }
      if (!el) continue;
      if (o.textContent == null) continue;
      // Skip elements currently being edited inline — rewriting textContent
      // mid-keystroke nukes the user's caret and breaks the contentEditable
      // session. The keystrokes themselves already update the DOM; the
      // override only needs to be re-applied on reload (next mount of this
      // injector with this byRef), not during typing.
      if (el.hasAttribute('data-ds-editing')) continue;
      if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
        el.firstChild.textContent = o.textContent;
      } else if (!el.querySelector('[data-ds-ref]') && el.children.length === 0) {
        el.textContent = o.textContent;
      }
    }
  }, [byRef, components]);

  if (!css) return null;
  return <style data-ds-overrides>{css}</style>;
}

// Friendly label precedence: quoted innerText (≤36 chars, longer → truncated to 32 + …),
// else a noun-y tag alias (link/button/text input/image/heading/icon), else the raw tag.
// Appends ` · ${artboardLabel}` (or artboardId fallback) when an artboard is known.
function friendlyTargetLabel(ctx) {
  if (!ctx) return 'element';
  const text = typeof ctx.text === 'string' ? ctx.text.trim() : '';
  let primary;
  if (text) {
    primary = text.length <= 36 ? `"${text}"` : `"${text.slice(0, 32).trimEnd()}…"`;
  } else {
    const tag = (ctx.tag || '').toLowerCase();
    if (tag === 'a') primary = 'link';
    else if (tag === 'button') primary = 'button';
    else if (tag === 'input' || tag === 'textarea') primary = 'text input';
    else if (tag === 'img') primary = 'image';
    else if (/^h[1-6]$/.test(tag)) primary = 'heading';
    else if (tag === 'svg') primary = 'icon';
    else primary = tag || 'element';
  }
  const where = ctx.artboardLabel || ctx.artboardId;
  return where ? `${primary} · ${where}` : primary;
}

function ContextList({ contexts }) {
  if (!contexts.length) return null;
  return (
    <ul className="m-0 list-none space-y-1 p-0 text-xs text-foreground/80">
      {contexts.slice(0, 5).map((ctx) => (
        <li key={ctx.ref}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-foreground/80 [&::-webkit-details-marker]:hidden">
              <span className="truncate">{friendlyTargetLabel(ctx)}</span>
              <span className="text-[10px] text-muted-foreground/70 group-open:hidden">
                selector
              </span>
              <span className="hidden text-[10px] text-muted-foreground/70 group-open:inline">
                hide
              </span>
            </summary>
            <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
              {ctx.dom}
            </div>
          </details>
        </li>
      ))}
      {contexts.length > 5 && (
        <li className="text-muted-foreground">+{contexts.length - 5} more</li>
      )}
    </ul>
  );
}

// Resolve the first DOM element associated with a list of context entries.
// Prefers a live data-ds-ref lookup, then resolveDsRef (structural path).
function resolveContextElement(contexts) {
  if (!contexts || !contexts.length) return null;
  for (const ctx of contexts) {
    const ref = ctx?.ref || ctx?.anchor;
    if (!ref) continue;
    const live = document.querySelector(`[data-ds-ref="${CSS.escape(ref)}"]`);
    if (live) return live;
    const resolved = resolveDsRef(ref);
    if (resolved) return resolved;
  }
  return null;
}

// Track an element so its bounding rect can be re-read on layout changes.
// Returns a virtual reference object compatible with @floating-ui/react.
function useVirtualAnchor(el) {
  const [, force] = useState(0);
  // Bump on layout changes (scroll/resize/transform) so floating-ui repositions.
  useEffect(() => {
    if (!el) return undefined;
    const tick = () => force((n) => (n + 1) & 0xffff);
    // autoUpdate watches scroll ancestors + resize of the reference.
    // The dummy 2nd arg is required by the dom API; we drive force-updates
    // through floating-ui's own autoUpdate via `whileElementsMounted` below,
    // so just listen to scroll/resize globally as a belt + suspenders.
    window.addEventListener('scroll', tick, true);
    window.addEventListener('resize', tick, true);
    return () => {
      window.removeEventListener('scroll', tick, true);
      window.removeEventListener('resize', tick, true);
    };
  }, [el]);

  return useMemo(() => {
    if (!el) return null;
    return {
      getBoundingClientRect: () => el.getBoundingClientRect(),
      contextElement: el,
    };
  }, [el]);
}

function CommentPopover({
  open,
  mode, // 'compose' | 'detail'
  contexts,
  comment,
  busy,
  anchorEl,
  onOpenChange,
  onSubmit, // (text, { sendToAgent })
  onDelete,
}) {
  const initialText = mode === 'detail' ? comment?.text || '' : '';
  const [text, setText] = useState(initialText);
  const popupRef = useRef(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    setText(initialText);
  }, [initialText, comment?.id]);

  const list = mode === 'detail' ? commentContexts(comment || {}) : contexts || [];
  const trimmed = text.trim();
  const isResolved = comment?.status === 'resolved';
  const isSent = comment?.sentToAgent;
  const dirty = mode === 'detail' ? trimmed !== comment?.text : trimmed.length > 0;

  const reference = useVirtualAnchor(anchorEl);
  const { refs, floatingStyles } = useFloating({
    open,
    placement: 'right-start',
    middleware: [offsetMiddleware(12), flip(), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(reference);
  }, [reference, refs]);

  // Capture the element that opened the popover so focus can be restored
  // when it closes — basic but important AT affordance.
  const restoreFocusRef = useRef(null);
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement;
      return undefined;
    }
    const el = restoreFocusRef.current;
    if (el && typeof el.focus === 'function') {
      // Defer so the popover unmount finishes before refocusing.
      const id = window.setTimeout(() => {
        try {
          el.focus();
        } catch {
          /* element gone */
        }
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Dismiss on outside click + Escape; light focus trap inside the popover.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const el = popupRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      // Don't close when clicking another canvas element while in compose mode;
      // composer is bound to its picked context until explicitly canceled.
      if (e.target.closest('.ds-review-ui')) return;
      onOpenChange?.(false);
    };
    const focusableSelector =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange?.(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const root = popupRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll(focusableSelector)).filter(
        (n) => !n.hasAttribute('disabled') && n.offsetParent !== null,
      );
      // No focusable targets — let Tab pass through to the document so the
      // user isn't trapped inside an empty popover. Do NOT preventDefault here.
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  if (!open || !anchorEl) return null;

  const title =
    mode === 'compose'
      ? `Comment${list.length > 1 ? ` · ${list.length} elements` : ''}`
      : `Comment${list.length > 1 ? ` · ${list.length} elements` : ''}`;
  const subtitle = isSent ? 'Sent to agent' : isResolved ? 'Resolved' : 'Open';

  return (
    <div
      ref={(node) => {
        popupRef.current = node;
        refs.setFloating(node);
      }}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={mode === 'detail' ? subtitleId : undefined}
      className="ds-review-ui z-[100000] flex w-[320px] flex-col gap-0 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden"
      style={{ ...floatingStyles, maxWidth: 'min(320px, calc(100vw - 32px))' }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <div id={titleId} className="text-sm font-medium leading-tight">
            {title}
          </div>
          {mode === 'detail' && (
            <p id={subtitleId} className="text-[11px] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close comment"
          className="-mr-1 -mt-0.5 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={() => onOpenChange?.(false)}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <FieldGroup>
          {list.length > 0 && (
            <Field>
              <FieldLabel>Targets</FieldLabel>
              <ContextList contexts={list} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="comment-body">What should change?</FieldLabel>
            <Textarea
              id="comment-body"
              value={text}
              autoFocus
              readOnly={isResolved}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the change you want…"
            />
          </Field>
        </FieldGroup>
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
        {!isResolved && (mode === 'compose' || !isSent) && (
          <Button
            size="sm"
            disabled={busy || !trimmed}
            onClick={() => onSubmit(trimmed, { sendToAgent: true })}
            className="w-full"
          >
            <Send data-icon="inline-start" />
            Send to agent
          </Button>
        )}
        {!isResolved && mode === 'detail' && dirty && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !trimmed}
            onClick={() => onSubmit(trimmed, { sendToAgent: false })}
            className="w-full"
          >
            Save changes
          </Button>
        )}
        {!isResolved && mode === 'compose' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !trimmed}
            onClick={() => onSubmit(trimmed, { sendToAgent: false })}
            className="w-full"
          >
            Save only
          </Button>
        )}
        {mode === 'compose' && (
          <button
            type="button"
            className="self-center rounded text-xs text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            disabled={busy}
            onClick={() => onOpenChange?.(false)}
          >
            Cancel
          </button>
        )}
        {mode === 'detail' && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={onDelete}
            className="w-full"
          >
            <Trash2 data-icon="inline-start" />
            Delete comment
          </Button>
        )}
      </div>
    </div>
  );
}

const CommentPin = React.forwardRef(function CommentPin(
  { refId, index, selected, comment, onSelect, onKeyDown, tabIndex },
  ref,
) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const el = document.querySelector(`[data-ds-ref="${refId}"]`);
    if (!el) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left + r.width / 2, top: r.top });
    };
    update();
    return autoUpdate(el, document.body, update);
  }, [refId]);

  if (!pos) return null;
  const isSent = !!comment?.sentToAgent;
  const excerpt = (comment?.text || '').trim().slice(0, 80);
  const truncated = (comment?.text || '').trim().length > 80;
  const tooltipBody = excerpt
    ? `${excerpt}${truncated ? '…' : ''}`
    : '(empty comment)';
  // Format author/timestamp suffix if available; falls back to text-only.
  let meta = '';
  if (comment?.author) meta = comment.author;
  if (comment?.createdAt) {
    try {
      const d = new Date(comment.createdAt);
      if (!Number.isNaN(d.getTime())) {
        meta = meta ? `${meta} · ${d.toLocaleString()}` : d.toLocaleString();
      }
    } catch {
      /* malformed timestamp — skip */
    }
  }

  // Background carries identity; border carries non-color state (dashed = sent,
  // solid = open) so it isn't 1.4.1 color-only. z-40 sits below the comment
  // popover (z-[100000]), edit panel sheet (z-50), and above selection overlay
  // (z-30) — intentional layering, do not change without auditing all four.
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            role="button"
            aria-pressed={selected || undefined}
            aria-label={`Open comment ${index + 1}${isSent ? ', sent to agent' : ''}: ${
              (comment?.text || '').slice(0, 60) || '(empty)'
            }`}
            tabIndex={tabIndex ?? 0}
            className={cn(
              'ds-review-ui fixed z-40 grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 bg-primary text-[11px] font-bold text-primary-foreground shadow-md transition-transform',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isSent
                ? 'border-2 border-dashed border-primary-foreground'
                : 'border-background',
              selected &&
                'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110',
            )}
            style={{ left: pos.left, top: pos.top }}
            onClick={onSelect}
            onKeyDown={onKeyDown}
          >
            <span aria-hidden>{index + 1}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-[260px]">
          <p className="text-xs leading-snug">{tooltipBody}</p>
          {meta && <p className="mt-1 text-[10px] text-muted-foreground">{meta}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

function CommentPinLayer({ comments, highlighted, onSelect }) {
  const open = useMemo(() => filterOpenComments(comments), [comments]);
  // Roving tabindex: one focusable pin at a time, arrow keys move focus.
  const [focusIdx, setFocusIdx] = useState(0);
  const pinRefs = useRef([]);
  useEffect(() => {
    if (focusIdx >= open.length) setFocusIdx(Math.max(0, open.length - 1));
  }, [open.length, focusIdx]);

  const handleKey = (i) => (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (i + 1) % open.length;
      setFocusIdx(next);
      pinRefs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i - 1 + open.length) % open.length;
      setFocusIdx(next);
      pinRefs.current[next]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
      pinRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = open.length - 1;
      setFocusIdx(last);
      pinRefs.current[last]?.focus();
    }
  };

  return open.map((c, i) => {
    const ctx = c.contexts?.[0] || c.context;
    const refId = ctx?.ref || c.anchor;
    if (!refId) return null;
    return (
      <CommentPin
        key={c.id}
        ref={(node) => {
          pinRefs.current[i] = node;
        }}
        refId={refId}
        index={i}
        comment={c}
        selected={highlighted === c.id}
        tabIndex={i === focusIdx ? 0 : -1}
        onSelect={() => {
          setFocusIdx(i);
          onSelect(c);
        }}
        onKeyDown={handleKey(i)}
      />
    );
  });
}

function ModeHint({ commentMode, hasSelection }) {
  // Tethered to the bottom-left of the canvas viewport so the hint associates
  // with the active mode. Reveal progressively: 1–2 primary hints inline
  // based on whether the user has selected an element; expand to the full
  // chord list on hover OR keyboard focus. A verbose description is exposed
  // to screen readers as a child of the region so it forms part of the
  // accessible name.
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef(null);

  // Tokenized primary line — each token carries an explicit type so we don't
  // need a regex to decide kbd vs text. Keeps the rendering loop trivial.
  let primary;
  if (commentMode) {
    primary = hasSelection
      ? [
          { type: 'kbd', text: 'Enter' },
          { type: 'text', text: 'to comment' },
          { type: 'sep', text: '·' },
          { type: 'kbd', text: '↑↓←→' },
          { type: 'text', text: 'walk tree' },
        ]
      : [
          { type: 'text', text: 'Click element' },
          { type: 'sep', text: '·' },
          { type: 'text', text: 'drag box' },
          { type: 'text', text: 'to select' },
        ];
  } else {
    primary = hasSelection
      ? [
          { type: 'text', text: 'Edit in panel' },
          { type: 'sep', text: '·' },
          { type: 'kbd', text: '↑↓←→' },
          { type: 'text', text: 'walk tree' },
        ]
      : [
          { type: 'text', text: 'Click element' },
          { type: 'text', text: 'to inspect' },
        ];
  }

  const allChords = commentMode
    ? [
        ['↑', 'parent'],
        ['↓', 'child'],
        ['←→', 'siblings'],
        ['Shift+click', 'multi-select'],
        ['drag', 'marquee select'],
        ['Enter', 'add comment'],
      ]
    : [
        ['Click', 'inspect element'],
        ['↑↓←→', 'walk tree'],
        ['live preview', 'as you type'],
      ];

  const verbose = commentMode
    ? 'Arrow up selects the parent element. Arrow down selects the child. Left and right arrows select siblings. Shift+click for multi-select. Drag to make a selection box. Press Enter to comment on the current selection.'
    : 'Click an element to inspect. Arrow keys navigate between elements. Edits show a live preview and save automatically.';

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((v) => !v);
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault();
        setExpanded(false);
        // Blur so focus doesn't keep the panel open via onFocus.
        try {
          wrapperRef.current?.blur();
        } catch {
          /* element gone */
        }
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label="Mode shortcuts"
      tabIndex={0}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className="ds-review-ui fixed bottom-4 left-4 z-40 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col items-start gap-1.5">
        {expanded && (
          <div
            role="group"
            aria-label="Keyboard shortcuts"
            className="flex flex-col gap-1 rounded-lg border border-border bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-md backdrop-blur-sm motion-safe:transition-opacity"
          >
            {allChords.map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {k}
                </kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
          {primary.map((tok, i) => {
            if (tok.type === 'sep') {
              return (
                <span key={i} aria-hidden className="opacity-40">
                  {tok.text}
                </span>
              );
            }
            if (tok.type === 'kbd') {
              return (
                <kbd
                  key={i}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                >
                  {tok.text}
                </kbd>
              );
            }
            return <span key={i}>{tok.text}</span>;
          })}
          <span aria-hidden className="ml-1 opacity-40">
            ·
          </span>
          <span className="text-muted-foreground/60">hover or focus for more</span>
        </div>
      </div>
      <span className="sr-only">{verbose}</span>
    </div>
  );
}

export function DesignReviewShell({ designName, children }) {
  const [commentMode, setCommentMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [comments, setComments] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [canvasStyles, setCanvasStyles] = useState({});
  const [componentOverrides, setComponentOverrides] = useState({});
  // Undo stack — each entry is a full snapshot of { byRef, canvas } from BEFORE
  // an applyOverride/applyCanvas call. Cmd+Z pops the latest and restores it.
  const undoStackRef = useRef([]);
  const [questions, setQuestions] = useState(null);
  const [pendingContexts, setPendingContexts] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [highlighted, setHighlighted] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentBusy, setCommentBusy] = useState(false);

  const activeComment = useMemo(
    () => (activeCommentId ? comments.find((c) => c.id === activeCommentId) : null),
    [comments, activeCommentId],
  );

  // Resolve a DOM anchor for the floating popovers. Recomputed whenever the
  // backing contexts/comments change so we always point at a live element.
  const [composeAnchorEl, setComposeAnchorEl] = useState(null);
  const [detailAnchorEl, setDetailAnchorEl] = useState(null);

  useEffect(() => {
    setComposeAnchorEl(resolveContextElement(pendingContexts));
  }, [pendingContexts]);

  useEffect(() => {
    setDetailAnchorEl(activeComment ? resolveContextElement(commentContexts(activeComment)) : null);
  }, [activeComment]);

  const closeCommentPanel = useCallback(() => {
    setActiveCommentId(null);
    setHighlighted(null);
    window.parent.postMessage({ type: '__comment_closed' }, '*');
  }, []);

  const openCommentPanel = useCallback((comment) => {
    if (!comment) return;
    setActiveCommentId(comment.id);
    setHighlighted(comment.id);
    setPendingContexts(null);
    setEditTarget(null);
    window.parent.postMessage({ type: '__comment_selected', id: comment.id }, '*');
  }, []);

  const reload = useCallback(async () => {
    const cData = await fetchDesignJson(designName, 'comments.json', { comments: [] });
    const oData = await fetchDesignJson(designName, 'overrides.json', { byRef: {}, canvas: {} });
    const qData = await fetchDesignJson(designName, 'questions.json', null);
    setComments(cData.comments || []);
    setOverrides(oData.byRef || {});
    setCanvasStyles(oData.canvas || {});
    setComponentOverrides(oData.components || {});
    setQuestions(qData);
  }, [designName]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    window.parent.postMessage({ type: '__review_ready' }, '*');
  }, []);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      switch (d.type) {
        case '__activate_comment_mode':
          setCommentMode(true);
          setEditMode(false);
          setEditTarget(null);
          setPendingContexts(null);
          break;
        case '__deactivate_comment_mode':
          setCommentMode(false);
          setPendingContexts(null);
          break;
        case '__activate_edit_panel':
          setEditMode(true);
          setCommentMode(false);
          setPendingContexts(null);
          break;
        case '__deactivate_edit_panel':
          setEditMode(false);
          setEditTarget(null);
          break;
        case '__highlight_comment':
          setHighlighted(d.id || null);
          if (d.id) setActiveCommentId(d.id);
          break;
        case '__open_comment':
          if (d.id) {
            setActiveCommentId(d.id);
            setHighlighted(d.id);
            setPendingContexts(null);
            setEditTarget(null);
          } else {
            setActiveCommentId(null);
            setHighlighted(null);
          }
          break;
        case '__close_comment':
          setActiveCommentId(null);
          setHighlighted(null);
          break;
        case '__comments_reload':
          reload();
          break;
        case '__comments_snapshot':
          if (Array.isArray(d.comments)) setComments(d.comments);
          break;
        case '__delete_comment_request':
          if (d.id) removeCommentRef.current?.(d.id);
          break;
        case '__send_comment_request':
          if (d.id) sendOneRef.current?.(d.id);
          break;
        case '__send_all_unsent_comments':
          sendAllUnsentRef.current?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [reload]);

  useEffect(() => {
    window.parent.postMessage({ type: '__comments_snapshot', comments, designName }, '*');
  }, [comments, designName]);

  const notifyEvent = useCallback(
    async (type, payload) => {
      await appendReviewEvent(designName, type, payload);
      window.parent.postMessage(
        { type: '__review_event', designName, eventType: type, ...payload },
        '*',
      );
    },
    [designName],
  );

  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((msg) => {
    setAnnouncement('');
    // Two-frame nudge so AT picks up the change even when the string repeats.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnnouncement(msg));
    });
  }, []);

  const addComment = useCallback(
    async (contexts, text, sendToAgent = false) => {
      const list = Array.isArray(contexts) ? contexts : [contexts];
      const entry = {
        id: `c-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'open',
        anchor: list[0]?.ref,
        context: list[0],
        contexts: list,
        text,
      };
      let next = [...comments, entry];
      setComments(next);
      setPendingContexts(null);
      next = await persistCommentsBundle(designName, next, questions);
      if (sendToAgent) {
        next = await sendCommentToAgent(designName, next, questions, entry.id);
        setComments(next);
      }
      await notifyEvent('comment.added', { commentId: entry.id, refs: list.map((c) => c.ref) });
      window.parent.postMessage({ type: '__comments_snapshot', comments: next, designName }, '*');
      window.parent.postMessage(
        { type: '__comment_added', comment: entry, sentToAgent: sendToAgent },
        '*',
      );
      announce(sendToAgent ? 'Comment added and sent to agent.' : 'Comment added.');
    },
    [comments, designName, questions, notifyEvent, announce],
  );

  const syncComments = useCallback(
    (next) => {
      setComments(next);
      window.parent.postMessage({ type: '__comments_snapshot', comments: next, designName }, '*');
    },
    [designName],
  );

  const removeComment = useCallback(
    async (commentId) => {
      setCommentBusy(true);
      try {
        const next = await deleteComment(designName, comments, questions, commentId);
        syncComments(next);
        window.parent.postMessage(
          { type: '__review_event', designName, eventType: 'comment.deleted', commentId },
          '*',
        );
        closeCommentPanel();
        announce('Comment deleted.');
      } finally {
        setCommentBusy(false);
      }
    },
    [comments, designName, questions, syncComments, closeCommentPanel, announce],
  );

  const submitDetail = useCallback(
    async (text, { sendToAgent }) => {
      if (!activeCommentId) return;
      setCommentBusy(true);
      try {
        let next = comments;
        const current = comments.find((c) => c.id === activeCommentId);
        if (text && current && text !== current.text) {
          next = await updateCommentText(designName, comments, questions, activeCommentId, text);
        }
        if (sendToAgent) {
          next = await sendCommentToAgent(designName, next, questions, activeCommentId);
          window.parent.postMessage(
            {
              type: '__review_event',
              designName,
              eventType: 'comment.sent',
              commentId: activeCommentId,
            },
            '*',
          );
        }
        syncComments(next);
      } finally {
        setCommentBusy(false);
      }
    },
    [activeCommentId, comments, designName, questions, syncComments],
  );

  const submitCompose = useCallback(
    (text, { sendToAgent }) => addComment(pendingContexts, text, sendToAgent),
    [addComment, pendingContexts],
  );

  // Refs let the postMessage handler call the latest version of each action
  // without re-binding the message listener every time `comments` changes.
  const removeCommentRef = useRef(null);
  const sendOneRef = useRef(null);
  const sendAllUnsentRef = useRef(null);

  const sendOne = useCallback(
    async (commentId) => {
      if (!commentId) return;
      setCommentBusy(true);
      try {
        const next = await sendCommentToAgent(designName, comments, questions, commentId);
        syncComments(next);
        window.parent.postMessage(
          { type: '__review_event', designName, eventType: 'comment.sent', commentId },
          '*',
        );
        announce('Comment sent to agent.');
      } finally {
        setCommentBusy(false);
      }
    },
    [comments, designName, questions, syncComments, announce],
  );

  // Keep refs current so the global message handler always invokes the
  // latest closure (otherwise stale `comments` would slip through).
  removeCommentRef.current = removeComment;
  sendOneRef.current = sendOne;

  const sendAllUnsent = useCallback(async () => {
    const ids = comments.filter((c) => c.status !== 'resolved' && !c.sentToAgent).map((c) => c.id);
    if (ids.length === 0) return;
    setCommentBusy(true);
    try {
      let next = comments;
      for (const id of ids) {
        next = await sendCommentToAgent(designName, next, questions, id);
        window.parent.postMessage(
          { type: '__review_event', designName, eventType: 'comment.sent', commentId: id },
          '*',
        );
      }
      syncComments(next);
    } finally {
      setCommentBusy(false);
    }
  }, [comments, designName, questions, syncComments]);

  sendAllUnsentRef.current = sendAllUnsent;

  const applyOverride = useCallback(
    async (ref, patch) => {
      // Push current state before mutating, so Cmd+Z can revert this edit.
      undoStackRef.current.push({
        byRef: overrides,
        canvas: canvasStyles,
        components: componentOverrides,
      });
      const next = { ...overrides, [ref]: { ...overrides[ref], ...patch } };
      setOverrides(next);
      await persistOverrides(designName, next, canvasStyles, componentOverrides);
      await notifyEvent('override.updated', { ref, keys: Object.keys(patch.styles || {}) });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
      scheduleDomSnapshot(designName);
    },
    [designName, overrides, canvasStyles, componentOverrides, notifyEvent],
  );

  const applyComponentOverride = useCallback(
    async (componentKey, component, patch) => {
      undoStackRef.current.push({
        byRef: overrides,
        canvas: canvasStyles,
        components: componentOverrides,
      });
      const next = {
        ...componentOverrides,
        [componentKey]: {
          ...componentOverrides[componentKey],
          ...patch,
          component,
        },
      };
      setComponentOverrides(next);
      await persistOverrides(designName, overrides, canvasStyles, next);
      await notifyEvent('componentOverride.updated', {
        componentKey,
        componentName: component?.name,
        keys: Object.keys(patch.styles || {}),
      });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
      scheduleDomSnapshot(designName);
    },
    [designName, overrides, canvasStyles, componentOverrides, notifyEvent],
  );

  const applyCanvasStyle = useCallback(
    async (patch) => {
      undoStackRef.current.push({
        byRef: overrides,
        canvas: canvasStyles,
        components: componentOverrides,
      });
      const next = { ...canvasStyles, ...patch };
      // Strip empty keys so they don't pollute the persisted JSON.
      for (const k of Object.keys(next)) {
        if (next[k] === '' || next[k] == null) delete next[k];
      }
      setCanvasStyles(next);
      await persistOverrides(designName, overrides, next, componentOverrides);
      await notifyEvent('canvas.updated', { keys: Object.keys(patch) });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
      scheduleDomSnapshot(designName);
    },
    [designName, overrides, canvasStyles, componentOverrides, notifyEvent],
  );

  // Take a baseline DOM snapshot when Edit mode is first entered, so the
  // agent has something to diff against even before the first override lands.
  useEffect(() => {
    if (editMode) scheduleDomSnapshot(designName);
  }, [editMode, designName]);

  const undoLastEdit = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return false;
    setOverrides(prev.byRef || {});
    setCanvasStyles(prev.canvas || {});
    setComponentOverrides(prev.components || {});
    persistOverrides(designName, prev.byRef || {}, prev.canvas || {}, prev.components || {}).catch(
      () => {},
    );
    window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
    return true;
  }, [designName]);

  // Cmd+Z / Ctrl+Z when Edit mode is active reverts the most recent applied edit.
  useEffect(() => {
    if (!editMode) return undefined;
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      // Don't hijack undo while the user is typing in a panel field.
      if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      undoLastEdit();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [editMode, undoLastEdit]);

  const pickMode = commentMode || editMode;

  const onPick = useCallback(
    (target, ctxOrList) => {
      if (commentMode) {
        const list = Array.isArray(ctxOrList) ? ctxOrList : [ctxOrList];
        setPendingContexts(list);
      } else if (editMode) {
        const el = Array.isArray(target) ? target[0] : target;
        setEditTarget(el);
      }
    },
    [commentMode, editMode],
  );

  const onTextEditCommit = useCallback(
    (el, textContent) => {
      const ref = el.dataset.dsRef;
      if (!ref) return;
      applyOverride(ref, { textContent });
    },
    [applyOverride],
  );

  const {
    overlay: selectionOverlay,
    selected: selectedEls,
    clearSelection,
  } = useSelectionPicker({
    active: pickMode,
    multiSelect: commentMode,
    onPick,
    // Only enable inline text editing in Edit mode — in Comment mode dblclick
    // should preserve the click-to-add-comment flow.
    onTextEditCommit: editMode ? onTextEditCommit : null,
  });

  useEffect(() => {
    if (activeCommentId && !comments.some((c) => c.id === activeCommentId)) {
      setActiveCommentId(null);
      setHighlighted(null);
    }
  }, [comments, activeCommentId]);

  useEffect(() => {
    if (!highlighted) return undefined;
    const c = comments.find((x) => x.id === highlighted);
    const ctx = c?.contexts?.[0] || c?.context;
    const ref = ctx?.ref || c?.anchor;
    const el = ref && document.querySelector(`[data-ds-ref="${ref}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return undefined;
  }, [highlighted, comments]);

  const ctxValue = useMemo(
    () => ({ designName, comments, overrides, commentMode, editMode }),
    [designName, comments, overrides, commentMode, editMode],
  );

  const showHint = pickMode && !pendingContexts && !editTarget && !activeComment;

  return (
    <ReviewCtx.Provider value={ctxValue}>
      <OverridesInjector byRef={overrides} canvas={canvasStyles} components={componentOverrides} />
      {children}
      {selectionOverlay}
      <CommentPinLayer comments={comments} highlighted={highlighted} onSelect={openCommentPanel} />

      <CommentPopover
        open={!!pendingContexts}
        mode="compose"
        contexts={pendingContexts || []}
        anchorEl={composeAnchorEl}
        busy={commentBusy}
        onOpenChange={(o) => {
          if (!o) {
            setPendingContexts(null);
            clearSelection();
          }
        }}
        onSubmit={submitCompose}
      />

      <CommentPopover
        open={!!activeComment}
        mode="detail"
        comment={activeComment}
        anchorEl={detailAnchorEl}
        busy={commentBusy}
        onOpenChange={(o) => {
          if (!o) closeCommentPanel();
        }}
        onSubmit={submitDetail}
        onDelete={() => activeComment && removeComment(activeComment.id)}
      />

      <EditPanel
        open={editMode}
        el={editTarget}
        overrides={overrides}
        canvasStyles={canvasStyles}
        componentOverrides={componentOverrides}
        onApply={applyOverride}
        onApplyComponent={applyComponentOverride}
        onApplyCanvas={applyCanvasStyle}
        onClearSelection={() => setEditTarget(null)}
        onClose={() => {
          // X / Edit-toggle-off: leave Edit mode entirely. Host listens for
          // __edit_panel_dismissed and flips its commentMode/editMode state.
          setEditTarget(null);
          setEditMode(false);
          window.parent.postMessage({ type: '__edit_panel_dismissed' }, '*');
        }}
      />

      {showHint && <ModeHint commentMode={commentMode} hasSelection={selectedEls.length > 0} />}

      {/* Live region for AT — announces comment add/send/delete. Visually hidden. */}
      <div className="ds-review-ui sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </ReviewCtx.Provider>
  );
}
