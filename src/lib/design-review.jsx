import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { resolveDsRef } from './elementContext.js';
import { appendReviewEvent } from './review-events.js';
import { useSelectionPicker } from './selection-picker.jsx';
import { fetchDesignJson, writeDesignFile } from '../preview/persistDesignFile.js';

const ReviewCtx = createContext(null);
export function useDesignReview() {
  return useContext(ReviewCtx);
}

async function persistOverrides(designName, byRef, canvas) {
  await writeDesignFile(`designs/${designName}/overrides.json`, {
    byRef,
    canvas: canvas || {},
  });
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
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(';');
  // Scope to `.design-canvas` only. Inherited properties (font-family,
  // font-size, color) flow into every artboard via normal CSS inheritance,
  // and non-inherited ones (background-color) stay on the canvas surface.
  // The Sheet/popover chrome lives at the body level — a body/:root rule
  // would cascade into the edit panel itself, which is the bug we just hit.
  return decl ? `.design-canvas{${decl}}` : '';
}

function OverridesInjector({ byRef, canvas }) {
  const css = useMemo(() => {
    const perRef = Object.entries(byRef || {})
      .map(([ref, o]) => stylesToCssRule(ref, o))
      .filter(Boolean)
      .join('\n');
    const rootRule = canvasRule(canvas);
    return [rootRule, perRef].filter(Boolean).join('\n');
  }, [byRef, canvas]);

  // Resolve each saved ref to its element via the structural path and stamp the
  // data-ds-ref attribute back on so the CSS rule matches on a fresh page load.
  // Then imperatively apply any saved textContent (guarded against destroying
  // child structure).
  useEffect(() => {
    for (const [ref, o] of Object.entries(byRef || {})) {
      let el = document.querySelector(`[data-ds-ref="${CSS.escape(ref)}"]`);
      if (!el) {
        el = resolveDsRef(ref);
        if (el) el.dataset.dsRef = ref;
      }
      if (!el) continue;
      if (o.textContent == null) continue;
      if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
        el.firstChild.textContent = o.textContent;
      } else if (!el.querySelector('[data-ds-ref]') && el.children.length === 0) {
        el.textContent = o.textContent;
      }
    }
  }, [byRef]);

  if (!css) return null;
  return <style data-ds-overrides>{css}</style>;
}

function ContextList({ contexts }) {
  if (!contexts.length) return null;
  return (
    <ul className="m-0 list-disc pl-4 text-[11px] text-muted-foreground">
      {contexts.slice(0, 5).map((ctx) => (
        <li key={ctx.ref} className="font-mono">
          {ctx.dom}
        </li>
      ))}
      {contexts.length > 5 && <li>+{contexts.length - 5} more</li>}
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

  // Dismiss on outside click + Escape.
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
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChange?.(false);
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
      className="ds-review-ui z-[100000] flex w-[320px] flex-col gap-0 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden"
      style={floatingStyles}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium leading-tight">{title}</div>
          {mode === 'detail' && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-label="Close"
          className="-mr-1 -mt-0.5 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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
            className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
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

function CommentPin({ refId, index, selected, onSelect }) {
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
  return (
    <button
      type="button"
      className={cn(
        'ds-review-ui fixed z-[99998] flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-[11px] font-bold text-primary-foreground shadow-md transition-transform',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110',
      )}
      style={{ left: pos.left, top: pos.top }}
      onClick={onSelect}
    >
      {index + 1}
    </button>
  );
}

function CommentPinLayer({ comments, highlighted, onSelect }) {
  return filterOpenComments(comments).map((c, i) => {
    const ctx = c.contexts?.[0] || c.context;
    const refId = ctx?.ref || c.anchor;
    if (!refId) return null;
    return (
      <CommentPin
        key={c.id}
        refId={refId}
        index={i}
        selected={highlighted === c.id}
        onSelect={() => onSelect(c)}
      />
    );
  });
}

function ModeHint({ commentMode }) {
  const text = commentMode
    ? '↑ parent · ↓ child · ←→ siblings · Shift+click multi · drag box · Enter to comment'
    : 'Click element to inspect · ↑↓←→ navigate · live preview · Apply to save';
  return (
    <div className="ds-review-ui fixed bottom-5 left-1/2 z-[99999] -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 text-xs text-foreground shadow-md pointer-events-none">
      {text}
    </div>
  );
}

export function DesignReviewShell({ designName, children }) {
  const [commentMode, setCommentMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [comments, setComments] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [canvasStyles, setCanvasStyles] = useState({});
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
    },
    [comments, designName, questions, notifyEvent],
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
      } finally {
        setCommentBusy(false);
      }
    },
    [comments, designName, questions, syncComments, closeCommentPanel],
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
      } finally {
        setCommentBusy(false);
      }
    },
    [comments, designName, questions, syncComments],
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
      undoStackRef.current.push({ byRef: overrides, canvas: canvasStyles });
      const next = { ...overrides, [ref]: { ...overrides[ref], ...patch } };
      setOverrides(next);
      await persistOverrides(designName, next, canvasStyles);
      await notifyEvent('override.updated', { ref, keys: Object.keys(patch.styles || {}) });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
    },
    [designName, overrides, canvasStyles, notifyEvent],
  );

  const applyCanvasStyle = useCallback(
    async (patch) => {
      undoStackRef.current.push({ byRef: overrides, canvas: canvasStyles });
      const next = { ...canvasStyles, ...patch };
      // Strip empty keys so they don't pollute the persisted JSON.
      for (const k of Object.keys(next)) {
        if (next[k] === '' || next[k] == null) delete next[k];
      }
      setCanvasStyles(next);
      await persistOverrides(designName, overrides, next);
      await notifyEvent('canvas.updated', { keys: Object.keys(patch) });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
    },
    [designName, overrides, canvasStyles, notifyEvent],
  );

  const undoLastEdit = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return false;
    setOverrides(prev.byRef || {});
    setCanvasStyles(prev.canvas || {});
    persistOverrides(designName, prev.byRef || {}, prev.canvas || {}).catch(() => {});
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

  const { overlay: selectionOverlay, clearSelection } = useSelectionPicker({
    active: pickMode,
    multiSelect: commentMode,
    onPick,
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
      <OverridesInjector byRef={overrides} canvas={canvasStyles} />
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
        onApply={applyOverride}
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

      {showHint && <ModeHint commentMode={commentMode} />}
    </ReviewCtx.Provider>
  );
}
