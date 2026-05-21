import { useCallback, useEffect, useRef, useState } from 'react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import { useDesignHostBridge } from './useDesignHostBridge.js';
import QuestionsPanel from './QuestionsPanel.jsx';
import ReviewSidebar from './ReviewSidebar.jsx';

const shell = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: '#29261b',
  color: '#f6f4ef',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
};

const bar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 14px',
  borderBottom: '1px solid rgba(255,255,255,.08)',
  flexShrink: 0,
};

const btn = (active) => ({
  appearance: 'none',
  border: '1px solid rgba(255,255,255,.14)',
  background: active ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)',
  color: '#f6f4ef',
  borderRadius: 8,
  padding: '6px 12px',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
});

const select = {
  appearance: 'none',
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.06)',
  color: '#f6f4ef',
  borderRadius: 8,
  padding: '6px 28px 6px 10px',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

export default function HostApp() {
  const iframeRef = useRef(null);
  const bridge = useDesignHostBridge(iframeRef);
  const [activeDesign, setActiveDesign] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/designs/active.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setActiveDesign(d?.name || ''))
      .catch(() => {});
  }, []);

  const { pollQuestions } = bridge;
  useEffect(() => {
    pollQuestions(activeDesign);
    const id = setInterval(() => pollQuestions(activeDesign), 3000);
    return () => clearInterval(id);
  }, [activeDesign, pollQuestions]);

  const copyAgentContext = useCallback(async () => {
    if (!activeDesign) return;
    try {
      const res = await fetch(`/designs/${activeDesign}/agent-feedback.md`);
      const text = res.ok ? await res.text() : '';
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, [activeDesign]);

  return (
    <div style={shell}>
      <header style={bar}>
        <strong style={{ fontSize: 14, letterSpacing: -0.2 }}>Design Space</strong>
        {activeDesign && (
          <span style={{ opacity: 0.55, fontSize: 12 }}>designs/{activeDesign}</span>
        )}
        <div style={{ flex: 1 }} />
        {bridge.canvasPresent && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ opacity: 0.65 }}>Zoom</span>
            <select
              style={select}
              value={bridge.zoomPresets.includes(bridge.zoom) ? bridge.zoom : ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v) bridge.setFrameZoom(v);
              }}
            >
              {!bridge.zoomPresets.includes(bridge.zoom) && (
                <option value="">{bridge.zoomPercent}%</option>
              )}
              {bridge.zoomPresets.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
          </label>
        )}
        {bridge.reviewReady && (
          <>
            <button
              type="button"
              style={btn(bridge.commentMode)}
              onClick={bridge.toggleCommentMode}
              title="Click elements in the preview to leave inline comments for agents"
            >
              Comment
            </button>
            <button
              type="button"
              style={btn(bridge.editMode)}
              onClick={bridge.toggleEditMode}
              title="Edit text and basic styles; saved to overrides.json"
            >
              Edit
            </button>
            <button
              type="button"
              style={btn(sidebarOpen)}
              onClick={() => {
                setSidebarOpen((o) => !o);
                bridge.clearPendingEvents();
              }}
            >
              Feedback
              {filterOpenComments(bridge.comments).length
                ? ` (${filterOpenComments(bridge.comments).length})`
                : ''}
              {bridge.pendingEvents > 0 ? ' •' : ''}
            </button>
          </>
        )}
        {bridge.questionsOpen && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: '#D97757',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            Questions
          </span>
        )}
        {bridge.tweaksAvailable && (
          <button type="button" style={btn(bridge.tweaksOpen)} onClick={bridge.toggleTweaks}>
            Tweaks
          </button>
        )}
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          title="Design preview"
          src="/preview.html"
          onLoad={bridge.onIframeLoad}
          style={{
            flex: 1,
            width: '100%',
            border: 0,
            background: '#f0eee9',
          }}
        />
        {sidebarOpen && (
          <ReviewSidebar
            designName={activeDesign}
            comments={bridge.comments}
            selectedCommentId={bridge.selectedCommentId}
            onSelectComment={bridge.selectComment}
            onCommentsChange={(next) => {
              bridge.updateComments(next);
              const win = iframeRef.current?.contentWindow;
              if (win) {
                win.postMessage(
                  { type: '__comments_snapshot', comments: next, designName: activeDesign },
                  '*',
                );
              }
              if (!next.some((c) => c.id === bridge.selectedCommentId)) {
                bridge.selectComment(null);
              }
            }}
            onCopyExport={copyAgentContext}
            onOpen={() => bridge.clearPendingEvents()}
          />
        )}
      </div>
      <QuestionsPanel
        designName={activeDesign}
        onAnswered={() => bridge.pollQuestions(activeDesign)}
        onDismiss={() => bridge.pollQuestions(activeDesign)}
      />
    </div>
  );
}
