import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, MessageSquare, Pencil, Sliders } from 'lucide-react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import { useDesignHostBridge } from './useDesignHostBridge.js';
import QuestionsPanel from './QuestionsPanel.jsx';
import ReviewSidebar from './ReviewSidebar.jsx';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

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

  // Comments mode and the Comments sidebar share one button — they open and
  // close together. Editing & tweaks both close the sidebar implicitly because
  // the bridge already deactivates commentMode when those modes engage.
  useEffect(() => {
    setSidebarOpen(bridge.commentMode);
  }, [bridge.commentMode]);

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

  const openCount = filterOpenComments(bridge.comments).length;

  return (
    <TooltipProvider delay={300}>
      <div className="flex h-screen flex-col bg-background text-foreground font-sans">
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2">
          <strong className="text-sm tracking-tight">Design Space</strong>
          {activeDesign && (
            <Badge variant="outline" className="font-mono text-[11px] tracking-tight">
              designs/{activeDesign}
            </Badge>
          )}
          <div className="flex-1" />

          {bridge.canvasPresent && (
            <div className="flex items-center gap-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={bridge.fitToScreen}
                title="Fit all artboards to screen (⌘1)"
              >
                <Maximize2 />
                <span>Fit</span>
              </Button>
              <span className="text-muted-foreground">Zoom</span>
              <Select
                value={bridge.zoomPresets.includes(bridge.zoom) ? String(bridge.zoom) : ''}
                onValueChange={(v) => {
                  const n = Number(v);
                  if (n) bridge.setFrameZoom(n);
                }}
              >
                <SelectTrigger size="sm" className="min-w-[72px]">
                  <SelectValue placeholder={`${bridge.zoomPercent}%`} />
                </SelectTrigger>
                <SelectContent>
                  {bridge.zoomPresets.map((z) => (
                    <SelectItem key={z} value={String(z)}>
                      {Math.round(z * 100)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {bridge.reviewReady && (
            <>
              <Separator orientation="vertical" className="!h-5" />
              <Button
                variant={bridge.commentMode ? 'default' : 'outline'}
                size="sm"
                aria-pressed={bridge.commentMode}
                onClick={() => {
                  bridge.toggleCommentMode();
                  bridge.clearPendingEvents();
                }}
                title="Add inline comments by clicking elements in the preview; sidebar lists every comment"
              >
                <MessageSquare />
                <span>Comments</span>
                {openCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-semibold">
                    {openCount}
                  </Badge>
                )}
                {bridge.pendingEvents > 0 && (
                  <span
                    aria-label="Unread events"
                    className="ml-0.5 size-1.5 rounded-full bg-primary"
                  />
                )}
              </Button>
              <Button
                variant={bridge.editMode ? 'default' : 'outline'}
                size="sm"
                aria-pressed={bridge.editMode}
                onClick={bridge.toggleEditMode}
                title="Edit text and basic styles; saved to overrides.json"
              >
                <Pencil />
                <span>Edit</span>
              </Button>
            </>
          )}

          {bridge.questionsOpen && (
            <Badge className="bg-[#D97757] text-white hover:bg-[#D97757]/90">Questions</Badge>
          )}

          {bridge.tweaksAvailable && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={bridge.tweaksOpen ? 'default' : 'outline'}
                    size="sm"
                    onClick={bridge.toggleTweaks}
                  >
                    <Sliders />
                    <span>Tweaks</span>
                  </Button>
                }
              />
              <TooltipContent>Open the tweaks panel for live design values</TooltipContent>
            </Tooltip>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <iframe
            ref={iframeRef}
            title="Design preview"
            src="/preview.html"
            onLoad={bridge.onIframeLoad}
            className="w-full flex-1 border-0"
            style={{ background: '#f0eee9' }}
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
              onSendComment={bridge.requestSendComment}
              onDeleteComment={bridge.requestDeleteComment}
              onSendAllUnsent={bridge.requestSendAllUnsent}
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
    </TooltipProvider>
  );
}
