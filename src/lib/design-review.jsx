import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import {
  deleteComment,
  persistCommentsBundle,
  sendCommentToAgent,
  updateCommentText,
} from './comment-actions.js';
import { describeElement } from './elementContext.js';
import { stylesToCssRule } from './css-property-schema.js';
import { EditPanel } from './edit-panel.jsx';
import { useSelectionPicker } from './selection-picker.jsx';
import { appendReviewEvent } from './review-events.js';
import { fetchDesignJson, writeDesignFile } from '../preview/persistDesignFile.js';

const ReviewCtx = createContext(null);

export function useDesignReview() {
  return useContext(ReviewCtx);
}

const ui = {
  panel: {
    position: 'fixed',
    right: 16,
    top: 72,
    width: 300,
    background: '#29261b',
    color: '#f6f4ef',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 12,
    padding: 14,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: 13,
    boxShadow: '0 12px 40px rgba(0,0,0,.35)',
    zIndex: 100000,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.06)',
    color: '#f6f4ef',
    borderRadius: 8,
    padding: '8px 10px',
    font: 'inherit',
    minHeight: 72,
    resize: 'vertical',
    marginBottom: 10,
  },
  btn: {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.1)',
    color: '#f6f4ef',
    borderRadius: 8,
    padding: '8px 12px',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  btnDanger: {
    appearance: 'none',
    border: '1px solid rgba(220,80,60,.45)',
    background: 'rgba(180,50,40,.3)',
    color: '#f6f4ef',
    borderRadius: 8,
    padding: '8px 12px',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  pin: {
    position: 'fixed',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#D97757',
    border: '2px solid #fff',
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    transform: 'translate(-50%, -50%)',
    cursor: 'pointer',
    zIndex: 99998,
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  hint: {
    position: 'fixed',
    left: '50%',
    bottom: 20,
    transform: 'translateX(-50%)',
    background: 'rgba(41,38,27,.92)',
    color: '#f6f4ef',
    padding: '10px 16px',
    borderRadius: 999,
    fontSize: 12,
    zIndex: 99999,
    pointerEvents: 'none',
    border: '1px solid rgba(255,255,255,.12)',
    maxWidth: 'min(520px, 92vw)',
    textAlign: 'center',
    lineHeight: 1.45,
  },
};

async function persistOverrides(designName, byRef) {
  await writeDesignFile(`designs/${designName}/overrides.json`, { byRef });
}

function OverridesInjector({ byRef }) {
  const css = useMemo(
    () =>
      Object.entries(byRef || {})
        .map(([ref, o]) => stylesToCssRule(ref, o))
        .filter(Boolean)
        .join('\n'),
    [byRef],
  );

  useEffect(() => {
    for (const [ref, o] of Object.entries(byRef || {})) {
      if (o.textContent == null) continue;
      const el = document.querySelector(`[data-ds-ref="${ref}"]`);
      if (el && o.textContent !== undefined) {
        if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
          el.firstChild.textContent = o.textContent;
        } else if (!el.querySelector('[data-ds-ref]')) {
          el.textContent = o.textContent;
        }
      }
    }
  }, [byRef]);

  if (!css) return null;
  return <style data-ds-overrides>{css}</style>;
}

function commentContexts(comment) {
  if (comment.contexts?.length) return comment.contexts;
  if (comment.context) return [comment.context];
  return [];
}

function CommentContextList({ contexts }) {
  if (!contexts.length) return null;
  return (
    <ul style={{ margin: '0 0 10px', paddingLeft: 16, fontSize: 11, opacity: 0.55 }}>
      {contexts.slice(0, 5).map((ctx) => (
        <li key={ctx.ref} style={{ fontFamily: 'ui-monospace, monospace' }}>
          {ctx.dom}
        </li>
      ))}
      {contexts.length > 5 && <li>+{contexts.length - 5} more</li>}
    </ul>
  );
}

function CommentComposer({ contexts, onSave, onSaveAndSend, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div className="ds-review-ui" style={ui.panel}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Comment{contexts.length > 1 ? ` (${contexts.length} elements)` : ''}
      </div>
      <CommentContextList contexts={contexts} />
      <textarea
        style={ui.textarea}
        placeholder="What should change?"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          style={{ ...ui.btn, background: '#D97757', border: 'none' }}
          onClick={() => text.trim() && onSaveAndSend(text.trim())}
        >
          Send to agent
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            style={{ ...ui.btn, flex: 1 }}
            onClick={() => text.trim() && onSave(text.trim())}
          >
            Save only
          </button>
          <button type="button" style={{ ...ui.btn, flex: 1, opacity: 0.8 }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentDetailPanel({ comment, busy, onSave, onSend, onDelete, onClose }) {
  const [text, setText] = useState(comment.text);
  const contexts = commentContexts(comment);
  const trimmed = text.trim();
  const dirty = trimmed !== comment.text;
  const isResolved = comment.status === 'resolved';

  useEffect(() => {
    setText(comment.text);
  }, [comment.id, comment.text]);

  return (
    <div className="ds-review-ui" style={ui.panel}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Comment{contexts.length > 1 ? ` (${contexts.length} elements)` : ''}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
        {comment.sentToAgent ? 'Sent to agent' : isResolved ? 'Resolved' : 'Open'}
      </div>
      <CommentContextList contexts={contexts} />
      <textarea
        style={ui.textarea}
        placeholder="What should change?"
        value={text}
        autoFocus
        readOnly={isResolved}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!isResolved && !comment.sentToAgent && (
          <button
            type="button"
            disabled={busy || !trimmed}
            style={{ ...ui.btn, background: '#D97757', border: 'none', opacity: busy ? 0.6 : 1 }}
            onClick={() => trimmed && onSend(trimmed)}
          >
            Send to agent
          </button>
        )}
        {!isResolved && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busy || !trimmed || !dirty}
              style={{ ...ui.btn, flex: 1, opacity: dirty ? 1 : 0.5 }}
              onClick={() => trimmed && dirty && onSave(trimmed)}
            >
              Save changes
            </button>
            <button
              type="button"
              style={{ ...ui.btn, flex: 1, opacity: 0.8 }}
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
        {isResolved && (
          <button
            type="button"
            style={{ ...ui.btn, opacity: 0.8 }}
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          style={{ ...ui.btnDanger, opacity: busy ? 0.6 : 1 }}
          onClick={onDelete}
        >
          Delete comment
        </button>
      </div>
    </div>
  );
}

function CommentPins({ comments, highlighted, onSelect }) {
  return filterOpenComments(comments).map((c, i) => {
    const ctx = c.contexts?.[0] || c.context;
    const el = document.querySelector(`[data-ds-ref="${ctx?.ref || c.anchor}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const selected = highlighted === c.id;
    return (
      <button
        key={c.id}
        type="button"
        className="ds-review-ui"
        title={c.text}
        style={{
          ...ui.pin,
          left: r.left + r.width / 2,
          top: r.top,
          outline: selected ? '2px solid #D97757' : undefined,
          outlineOffset: 2,
          transform: selected ? 'scale(1.15)' : undefined,
        }}
        onClick={() => onSelect(c)}
      >
        {i + 1}
      </button>
    );
  });
}

export function DesignReviewShell({ designName, children }) {
  const [commentMode, setCommentMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [comments, setComments] = useState([]);
  const [overrides, setOverrides] = useState({});
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
    const oData = await fetchDesignJson(designName, 'overrides.json', { byRef: {} });
    const qData = await fetchDesignJson(designName, 'questions.json', null);
    setComments(cData.comments || []);
    setOverrides(oData.byRef || {});
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
          if (d.id) {
            setActiveCommentId(d.id);
          }
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

  const saveCommentEdits = useCallback(
    async (commentId, text) => {
      setCommentBusy(true);
      try {
        const next = await updateCommentText(designName, comments, questions, commentId, text);
        syncComments(next);
      } finally {
        setCommentBusy(false);
      }
    },
    [comments, designName, questions, syncComments],
  );

  const sendExistingComment = useCallback(
    async (commentId, text) => {
      setCommentBusy(true);
      try {
        let next = comments;
        const current = comments.find((x) => x.id === commentId);
        if (text && current && text !== current.text) {
          next = await updateCommentText(designName, comments, questions, commentId, text);
        }
        next = await sendCommentToAgent(designName, next, questions, commentId);
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

  const applyOverride = useCallback(
    async (ref, patch) => {
      const next = { ...overrides, [ref]: { ...overrides[ref], ...patch } };
      setOverrides(next);
      setEditTarget(null);
      await persistOverrides(designName, next);
      await notifyEvent('override.updated', { ref, keys: Object.keys(patch.styles || {}) });
      window.parent.postMessage({ type: '__overrides_updated', designName }, '*');
    },
    [designName, overrides, notifyEvent],
  );

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

  const hint = commentMode
    ? '↑ parent · ↓ child · ←→ siblings · Shift+click multi · drag box · Enter to comment'
    : 'Click element to inspect · ↑↓←→ navigate · edit all CSS in panel';

  return (
    <ReviewCtx.Provider value={ctxValue}>
      <OverridesInjector byRef={overrides} />
      {children}
      {selectionOverlay}
      <CommentPins
        comments={comments}
        highlighted={highlighted}
        onSelect={(c) => openCommentPanel(c)}
      />
      {activeComment && (
        <CommentDetailPanel
          comment={activeComment}
          busy={commentBusy}
          onSave={(text) => saveCommentEdits(activeComment.id, text)}
          onSend={(text) => sendExistingComment(activeComment.id, text)}
          onDelete={() => removeComment(activeComment.id)}
          onClose={closeCommentPanel}
        />
      )}
      {pickMode && !pendingContexts && !editTarget && !activeComment && (
        <div className="ds-review-ui" style={ui.hint}>
          {hint}
        </div>
      )}
      {pendingContexts && !activeComment && (
        <CommentComposer
          contexts={pendingContexts}
          onSave={(text) => addComment(pendingContexts, text, false)}
          onSaveAndSend={(text) => addComment(pendingContexts, text, true)}
          onCancel={() => {
            setPendingContexts(null);
            clearSelection();
          }}
        />
      )}
      {editTarget && (
        <EditPanel
          el={editTarget}
          overrides={overrides}
          onApply={applyOverride}
          onClose={() => setEditTarget(null)}
        />
      )}
    </ReviewCtx.Provider>
  );
}
