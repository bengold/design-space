import { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function useDesignHostBridge(iframeRef) {
  const [canvasPresent, setCanvasPresent] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tweaksAvailable, setTweaksAvailable] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [comments, setComments] = useState([]);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  const tweaksOpenRef = useRef(false);
  const commentModeRef = useRef(false);
  const editModeRef = useRef(false);
  tweaksOpenRef.current = tweaksOpen;
  commentModeRef.current = commentMode;
  editModeRef.current = editMode;

  const postToFrame = useCallback(
    (msg) => {
      const win = iframeRef.current?.contentWindow;
      if (win) win.postMessage(msg, '*');
    },
    [iframeRef],
  );

  const deactivateReviewModes = useCallback(() => {
    if (commentModeRef.current) {
      setCommentMode(false);
      postToFrame({ type: '__deactivate_comment_mode' });
    }
    if (editModeRef.current) {
      setEditMode(false);
      postToFrame({ type: '__deactivate_edit_panel' });
    }
  }, [postToFrame]);

  useEffect(() => {
    const onMsg = (e) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;

      switch (d.type) {
        case '__dc_present':
          setCanvasPresent(true);
          break;
        case '__dc_zoom':
          if (typeof d.scale === 'number') setZoom(d.scale);
          break;
        case '__edit_mode_available':
          setTweaksAvailable(true);
          break;
        case '__edit_mode_dismissed':
          setTweaksOpen(false);
          break;
        case '__edit_panel_dismissed':
          // Edit panel closed itself via X (or X re-clicked Edit toggle inside
          // the iframe). Mirror it on the host so the Edit button flips off.
          setEditMode(false);
          break;
        case '__review_ready':
          setReviewReady(true);
          break;
        case '__comments_snapshot':
          if (Array.isArray(d.comments)) setComments(d.comments);
          break;
        case '__comment_added':
          if (d.comment) setComments((prev) => [...prev, d.comment]);
          break;
        case '__comment_selected':
          setSelectedCommentId(d.id || null);
          break;
        case '__comment_closed':
          setSelectedCommentId(null);
          break;
        case '__review_event':
          setPendingEvents((n) => n + 1);
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [iframeRef]);

  const pollQuestions = useCallback(async (designName) => {
    if (!designName) {
      setQuestionsOpen(false);
      return;
    }
    try {
      const res = await fetch(`/designs/${designName}/questions.json`);
      if (!res.ok) {
        setQuestionsOpen(false);
        return;
      }
      const q = await res.json();
      setQuestionsOpen(q.status === 'pending' && q.trigger === 'open');
    } catch {
      setQuestionsOpen(false);
    }
  }, []);

  const setFrameZoom = useCallback(
    (scale) => {
      postToFrame({ type: '__dc_set_zoom', scale });
    },
    [postToFrame],
  );

  const probeFrame = useCallback(() => {
    postToFrame({ type: '__dc_probe' });
  }, [postToFrame]);

  const toggleTweaks = useCallback(() => {
    const next = !tweaksOpenRef.current;
    if (next) deactivateReviewModes();
    setTweaksOpen(next);
    postToFrame({ type: next ? '__activate_edit_mode' : '__deactivate_edit_mode' });
  }, [postToFrame, deactivateReviewModes]);

  const toggleCommentMode = useCallback(() => {
    const next = !commentModeRef.current;
    if (next) {
      setTweaksOpen(false);
      postToFrame({ type: '__deactivate_edit_mode' });
      setEditMode(false);
      postToFrame({ type: '__deactivate_edit_panel' });
    }
    setCommentMode(next);
    postToFrame({ type: next ? '__activate_comment_mode' : '__deactivate_comment_mode' });
  }, [postToFrame]);

  const toggleEditMode = useCallback(() => {
    const next = !editModeRef.current;
    if (next) {
      setTweaksOpen(false);
      postToFrame({ type: '__deactivate_edit_mode' });
      setCommentMode(false);
      postToFrame({ type: '__deactivate_comment_mode' });
    }
    setEditMode(next);
    postToFrame({ type: next ? '__activate_edit_panel' : '__deactivate_edit_panel' });
  }, [postToFrame]);

  const highlightComment = useCallback(
    (id) => {
      setSelectedCommentId(id || null);
      postToFrame({ type: id ? '__open_comment' : '__close_comment', id });
    },
    [postToFrame],
  );

  const selectComment = useCallback(
    (id) => {
      setSelectedCommentId(id || null);
      postToFrame({ type: id ? '__open_comment' : '__close_comment', id });
    },
    [postToFrame],
  );

  const updateComments = useCallback((next) => {
    setComments(Array.isArray(next) ? next : []);
  }, []);

  // Per-row actions from the Comments sidebar route through the preview iframe
  // (where the comment-actions module lives + writes to disk + appends events).
  const requestDeleteComment = useCallback(
    (id) => {
      if (!id) return;
      postToFrame({ type: '__delete_comment_request', id });
    },
    [postToFrame],
  );

  const requestSendComment = useCallback(
    (id) => {
      if (!id) return;
      postToFrame({ type: '__send_comment_request', id });
    },
    [postToFrame],
  );

  const requestSendAllUnsent = useCallback(() => {
    postToFrame({ type: '__send_all_unsent_comments' });
  }, [postToFrame]);

  const onIframeLoad = useCallback(() => {
    setCanvasPresent(false);
    setTweaksAvailable(false);
    setTweaksOpen(false);
    setReviewReady(false);
    setCommentMode(false);
    setEditMode(false);
    setComments([]);
    setSelectedCommentId(null);
    probeFrame();
  }, [probeFrame]);

  return {
    canvasPresent,
    zoom,
    zoomPercent: Math.round(zoom * 100),
    zoomPresets: ZOOM_PRESETS,
    setFrameZoom,
    tweaksAvailable,
    tweaksOpen,
    toggleTweaks,
    reviewReady,
    commentMode,
    editMode,
    toggleCommentMode,
    toggleEditMode,
    comments,
    updateComments,
    selectedCommentId,
    selectComment,
    pendingEvents,
    clearPendingEvents: () => setPendingEvents(0),
    highlightComment,
    requestDeleteComment,
    requestSendComment,
    requestSendAllUnsent,
    questionsOpen,
    pollQuestions,
    onIframeLoad,
  };
}
