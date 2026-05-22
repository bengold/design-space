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

function Kbd({ children }) {
  return (
    <kbd
      data-slot="kbd"
      className="ml-1 inline-flex h-4 items-center rounded-sm border border-background/25 bg-background/10 px-1 font-mono text-[10px] font-medium leading-none"
    >
      {children}
    </kbd>
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

  // Fit the canvas to the viewport once on first ready. Default zoom of 100%
  // leaves a half-screen of empty space above the artboard row; fit-to-screen
  // centers the work and gives the user something to look at.
  const fittedRef = useRef(false);
  const { canvasPresent, fitToScreen } = bridge;
  useEffect(() => {
    if (fittedRef.current) return;
    if (!canvasPresent) return;
    fittedRef.current = true;
    fitToScreen();
  }, [canvasPresent, fitToScreen]);

  const { pollQuestions } = bridge;
  useEffect(() => {
    pollQuestions(activeDesign);
    const id = setInterval(() => pollQuestions(activeDesign), 3000);
    return () => clearInterval(id);
  }, [activeDesign, pollQuestions]);

  // Single-key toggles (c/e/t). Only fire on the host window — the canvas
  // iframe runs its own ⌘1 / ⌘0 / ⌘[ / ⌘] handlers in its own window scope.
  const {
    toggleCommentMode,
    toggleEditMode,
    toggleTweaks,
    clearPendingEvents,
    reviewReady,
    tweaksAvailable,
  } = bridge;
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'c' && reviewReady) {
        e.preventDefault();
        toggleCommentMode();
        clearPendingEvents();
      } else if (k === 'e' && reviewReady) {
        e.preventDefault();
        toggleEditMode();
      } else if (k === 't' && tweaksAvailable) {
        e.preventDefault();
        toggleTweaks();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    reviewReady,
    tweaksAvailable,
    toggleCommentMode,
    toggleEditMode,
    toggleTweaks,
    clearPendingEvents,
  ]);

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
            <h1 className="text-sm font-bold tracking-tight">Design Space</h1>
            {activeDesign && (
              <Badge variant="outline" className="font-mono text-[11px] tracking-tight">
                designs/{activeDesign}
              </Badge>
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
                  {bridge.pages.map((p, i) => {
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
                        <span className="flex-1">{p.title}</span>
                        <span className="ml-3 text-[10px] text-muted-foreground tabular-nums">
                          {i + 1}/{bridge.pages.length}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  <div className="mt-1 flex items-center justify-end gap-1 border-t px-2 pt-1.5 pb-0.5 text-[10px] text-muted-foreground">
                    <span>Switch</span>
                    <kbd className="inline-flex h-4 items-center rounded-sm border bg-muted px-1 font-mono text-[10px] leading-none">
                      ⌘[
                    </kbd>
                    <kbd className="inline-flex h-4 items-center rounded-sm border bg-muted px-1 font-mono text-[10px] leading-none">
                      ⌘]
                    </kbd>
                  </div>
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
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <ModePillButton
                            active={bridge.commentMode}
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
                        }
                      />
                      <TooltipContent>
                        Click elements to comment<Kbd>C</Kbd>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <ModePillButton active={bridge.editMode} onClick={bridge.toggleEditMode}>
                            <Pencil className="size-3.5" />
                            <span>Edit</span>
                          </ModePillButton>
                        }
                      />
                      <TooltipContent>
                        Edit text &amp; styles · overrides.json<Kbd>E</Kbd>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                {bridge.tweaksAvailable && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <ModePillButton active={bridge.tweaksOpen} onClick={bridge.toggleTweaks}>
                          <Sliders className="size-3.5" />
                          <span>Tweaks</span>
                        </ModePillButton>
                      }
                    />
                    <TooltipContent>
                      Live design values · per-design controls<Kbd>T</Kbd>
                    </TooltipContent>
                  </Tooltip>
                )}
              </ModePill>
            </>
          )}

          {bridge.questionsOpen && (
            <Badge
              role="status"
              aria-label="Questions awaiting your answer"
              className="bg-amber-500 text-white hover:bg-amber-500/90 motion-safe:animate-pulse"
            >
              Questions
            </Badge>
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
