import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Maximize2, MessageSquare, Pencil, Sliders } from 'lucide-react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import { useDesignHostBridge } from './useDesignHostBridge.js';
import QuestionsPanel from './QuestionsPanel.jsx';
import ReviewSidebar from './ReviewSidebar.jsx';
import AgentPresence from './AgentPresence.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Segmented mode pill — three mutually-exclusive toggles rendered as one
// rounded enclosure. Active item uses bg-muted (subtle filled) not bg-primary
// (heavy CTA) so the chrome doesn't shout. Hairline dividers between items
// communicate that exactly one mode is selectable at a time.
function ModePill({ children }) {
  return (
    <div
      role="group"
      aria-label="Modes"
      className="flex items-center rounded-lg border border-border bg-background p-0.5 shadow-xs"
    >
      {children}
    </div>
  );
}

function ModePillButton({ active, onClick, title, children, badge, dot }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[0.8rem] font-medium transition-colors',
        active
          ? 'bg-muted text-foreground shadow-xs'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {children}
      {badge}
      {dot}
    </button>
  );
}

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
  const activePageTitle = bridge.pages.find((p) => p.id === bridge.activePage)?.title ?? '—';

  return (
    <TooltipProvider delay={300}>
      <div className="flex h-screen flex-col bg-background text-foreground font-sans">
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2">
          {/* ── Cluster 1: Identity (brand · design · page) ──────────────── */}
          <div className="flex items-center gap-2">
            <strong className="text-sm tracking-tight">Design Space</strong>
            {activeDesign && (
              <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                designs/{activeDesign}
              </span>
            )}
            {bridge.pages.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      title={`Switch page (⌘[ / ⌘]) — ${bridge.pages.findIndex((p) => p.id === bridge.activePage) + 1} of ${bridge.pages.length}`}
                    >
                      <span>{activePageTitle}</span>
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" className="min-w-[200px]">
                  {bridge.pages.map((p) => {
                    const isActive = p.id === bridge.activePage;
                    return (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => bridge.setActivePage(p.id)}
                        data-active={isActive || undefined}
                        className="data-[active]:bg-muted data-[active]:font-medium"
                      >
                        <span className="flex w-4 items-center justify-center">
                          {isActive && <Check className="size-3.5 text-foreground" />}
                        </span>
                        <span>{p.title}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex-1" />

          {/* ── Cluster 2: Presence ──────────────────────────────────────── */}
          {activeDesign && <AgentPresence designName={activeDesign} />}

          {/* ── Cluster 3: View (unified zoom dropdown with Fit) ────────── */}
          {bridge.canvasPresent && (
            <>
              <Separator orientation="vertical" className="!h-5" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      title="Zoom (⌘1 fit · ⌘0 100%)"
                      className="min-w-[88px]"
                    >
                      <Maximize2 />
                      <span className="tabular-nums">{bridge.zoomPercent}%</span>
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="min-w-[170px]">
                  <DropdownMenuItem onClick={bridge.fitToScreen}>
                    <Maximize2 className="size-3.5" />
                    <span>Fit to screen</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">⌘1</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {bridge.zoomPresets.map((z) => {
                    const isActive = bridge.zoom === z;
                    return (
                      <DropdownMenuItem
                        key={z}
                        onClick={() => bridge.setFrameZoom(z)}
                        data-active={isActive || undefined}
                        className="data-[active]:bg-muted"
                      >
                        <span className="flex w-4 items-center justify-center">
                          {isActive && <Check className="size-3.5 text-foreground" />}
                        </span>
                        <span className="tabular-nums">{Math.round(z * 100)}%</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* ── Cluster 4: Modes (segmented pill — exclusive) ───────────── */}
          {(bridge.reviewReady || bridge.tweaksAvailable) && (
            <>
              <Separator orientation="vertical" className="!h-5" />
              <ModePill>
                {bridge.reviewReady && (
                  <>
                    <ModePillButton
                      active={bridge.commentMode}
                      title="Add inline comments by clicking elements in the preview"
                      onClick={() => {
                        bridge.toggleCommentMode();
                        bridge.clearPendingEvents();
                      }}
                      badge={
                        openCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-0.5 h-4 px-1.5 text-[10px] font-semibold"
                          >
                            {openCount}
                          </Badge>
                        )
                      }
                      dot={
                        bridge.pendingEvents > 0 && (
                          <span
                            aria-label="Unread events"
                            className="ml-0.5 size-1.5 rounded-full bg-primary"
                          />
                        )
                      }
                    >
                      <MessageSquare className="size-3.5" />
                      <span>Comments</span>
                    </ModePillButton>
                    <ModePillButton
                      active={bridge.editMode}
                      title="Edit text and basic styles; saved to overrides.json"
                      onClick={bridge.toggleEditMode}
                    >
                      <Pencil className="size-3.5" />
                      <span>Edit</span>
                    </ModePillButton>
                  </>
                )}
                {bridge.tweaksAvailable && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <ModePillButton
                          active={bridge.tweaksOpen}
                          onClick={bridge.toggleTweaks}
                          title="Open the tweaks panel for live design values"
                        >
                          <Sliders className="size-3.5" />
                          <span>Tweaks</span>
                        </ModePillButton>
                      }
                    />
                    <TooltipContent>Live design values</TooltipContent>
                  </Tooltip>
                )}
              </ModePill>
            </>
          )}

          {bridge.questionsOpen && (
            <Badge className="bg-[#D97757] text-white hover:bg-[#D97757]/90">Questions</Badge>
          )}
        </header>

        {/* Canvas area — the iframe fills the area, the sidebar overlays it
            (absolute positioning) instead of resizing it via flex, so artboard
            G never disappears off the right edge when Comments opens. */}
        <div className="relative flex min-h-0 flex-1">
          <iframe
            ref={iframeRef}
            title="Design preview"
            src="/preview.html"
            onLoad={bridge.onIframeLoad}
            className="size-full border-0"
            style={{ background: '#f0eee9' }}
          />
          {sidebarOpen && (
            <>
              {/* subtle backdrop fade on the canvas edge under the sidebar */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 right-80 bottom-0 w-12 bg-gradient-to-r from-transparent to-background/70"
              />
              <div className="absolute top-0 right-0 bottom-0 flex w-80">
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
              </div>
            </>
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
