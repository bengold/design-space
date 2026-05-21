import { useCallback, useEffect, useState } from 'react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import { fetchCommentsBundle } from './commentApi.js';

const sidebar = {
  width: 320,
  flexShrink: 0,
  borderLeft: '1px solid rgba(255,255,255,.08)',
  background: '#1f1d16',
  color: '#f6f4ef',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: 13,
};

const card = (selected) => ({
  padding: 10,
  borderRadius: 8,
  marginBottom: 8,
  background: selected ? 'rgba(217,119,87,.15)' : 'rgba(255,255,255,.05)',
  border: selected ? '1px solid rgba(217,119,87,.45)' : '1px solid rgba(255,255,255,.08)',
  lineHeight: 1.4,
  cursor: 'pointer',
});

const smallBtn = {
  appearance: 'none',
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.08)',
  color: '#f6f4ef',
  borderRadius: 6,
  padding: '5px 8px',
  font: 'inherit',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

export default function ReviewSidebar({
  designName,
  comments: bridgeComments,
  selectedCommentId,
  onSelectComment,
  onCommentsChange,
  onCopyExport,
  onOpen,
}) {
  const [comments, setComments] = useState(bridgeComments || []);

  const reload = useCallback(async () => {
    if (!designName) return;
    const bundle = await fetchCommentsBundle(designName);
    setComments(bundle.comments);
    onCommentsChange?.(bundle.comments);
    return bundle;
  }, [designName, onCommentsChange]);

  useEffect(() => {
    setComments(bridgeComments || []);
  }, [bridgeComments]);

  useEffect(() => {
    reload();
    onOpen?.();
  }, [reload, onOpen]);

  const open = filterOpenComments(comments);
  const resolved = comments.filter((c) => c.status === 'resolved');

  return (
    <aside style={sidebar} className="ds-review-ui">
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <strong style={{ fontSize: 13 }}>Feedback</strong>
        <div style={{ opacity: 0.55, fontSize: 11, marginTop: 4 }}>
          {open.length} open · click to open in preview
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {open.length === 0 && (
          <p style={{ opacity: 0.5, margin: 0, lineHeight: 1.45 }}>
            Add comments in the preview, then click a pin or list item to edit or delete.
          </p>
        )}
        {open.map((c) => {
          const isSelected = selectedCommentId === c.id;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              style={card(isSelected)}
              onClick={() => onSelectComment?.(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectComment?.(c.id);
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {c.sentToAgent ? '● Sent' : '○ Open'}
              </div>
              <div>{c.text}</div>
              {(c.contexts?.[0] || c.context)?.artboardLabel && (
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
                  {(c.contexts?.[0] || c.context).artboardLabel}
                </div>
              )}
            </div>
          );
        })}
        {resolved.length > 0 && (
          <details style={{ marginTop: 12, opacity: 0.65 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Resolved ({resolved.length})
            </summary>
            {resolved.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                style={{ ...card(selectedCommentId === c.id), opacity: 0.85 }}
                onClick={() => onSelectComment?.(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectComment?.(c.id);
                }}
              >
                <div style={{ textDecoration: 'line-through' }}>{c.text}</div>
              </div>
            ))}
          </details>
        )}
      </div>
      <div
        style={{
          padding: 12,
          borderTop: '1px solid rgba(255,255,255,.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button type="button" onClick={onCopyExport} style={smallBtn}>
          Copy agent context
        </button>
        <button type="button" onClick={reload} style={{ ...smallBtn, opacity: 0.7 }}>
          Refresh
        </button>
      </div>
    </aside>
  );
}
