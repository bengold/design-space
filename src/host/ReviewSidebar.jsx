import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, RefreshCw, Send, Trash2 } from 'lucide-react';
import { filterOpenComments } from '../../lib/comment-utils.mjs';
import { fetchCommentsBundle } from './commentApi.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

function statusOf(comment) {
  if (comment.status === 'resolved') return 'resolved';
  if (comment.sentToAgent) return 'sent';
  return 'open';
}

function StatusBadge({ status }) {
  if (status === 'resolved') {
    return (
      <Badge variant="secondary" className="text-[10px] font-medium">
        Resolved
      </Badge>
    );
  }
  if (status === 'sent') {
    return (
      <Badge variant="outline" className="text-[10px] font-medium">
        Sent
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="text-[10px] font-medium">
      Open
    </Badge>
  );
}

function CommentRow({ comment, selected, onSelect, onSend, onDelete, dimmed }) {
  const status = statusOf(comment);
  const ctx = comment.contexts?.[0] || comment.context;
  const canSend = status === 'open';
  const canDelete = status !== 'resolved';
  const excerpt = (comment.text || '').slice(0, 80) || '(empty)';
  return (
    <article
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative rounded-lg border p-2.5 text-sm transition-colors',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/60',
        dimmed && 'opacity-70',
      )}
    >
      {/* Row-level open affordance — covers the whole card behind the action buttons */}
      <button
        type="button"
        aria-label={`Open ${status} comment: ${excerpt}`}
        onClick={() => onSelect?.(comment.id)}
        className={cn(
          'absolute inset-0 z-0 cursor-pointer rounded-lg',
          'focus:outline-none focus-visible:outline-none',
        )}
      />
      <div className="relative z-10 mb-1.5 flex items-center justify-between gap-2 pointer-events-none">
        <StatusBadge status={status} />
        <div className="pointer-events-auto flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {canSend && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Send to agent"
              onClick={() => onSend?.(comment.id)}
            >
              <Send />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Delete"
              onClick={() => onDelete?.(comment.id)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <div
        className={cn(
          'relative z-0 leading-snug text-foreground pointer-events-none',
          status === 'resolved' && 'line-through text-muted-foreground',
        )}
      >
        {comment.text}
      </div>
      {ctx?.artboardLabel && (
        <div className="relative z-0 mt-1.5 text-[11px] text-muted-foreground pointer-events-none">
          {ctx.artboardLabel}
        </div>
      )}
    </article>
  );
}

export default function ReviewSidebar({
  designName,
  comments: bridgeComments,
  selectedCommentId,
  onSelectComment,
  onCommentsChange,
  onCopyExport,
  onSendComment,
  onDeleteComment,
  onSendAllUnsent,
  onOpen,
}) {
  const [comments, setComments] = useState(bridgeComments || []);

  // Ref-stabilize callbacks so reload + mount effects don't churn when parents pass new prop identities.
  const onCommentsChangeRef = useRef(onCommentsChange);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onCommentsChangeRef.current = onCommentsChange;
  }, [onCommentsChange]);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const reload = useCallback(async () => {
    if (!designName) return;
    const bundle = await fetchCommentsBundle(designName);
    setComments(bundle.comments);
    onCommentsChangeRef.current?.(bundle.comments);
    return bundle;
  }, [designName]);

  useEffect(() => {
    setComments(bridgeComments || []);
  }, [bridgeComments]);

  useEffect(() => {
    reload();
    onOpenRef.current?.();
    // Only re-run when the active design changes; callbacks are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designName]);

  const open = filterOpenComments(comments);
  const resolved = comments.filter((c) => c.status === 'resolved');
  const unsentCount = open.filter((c) => !c.sentToAgent).length;

  return (
    <aside
      aria-label="Comments"
      className="ds-review-ui flex h-full w-80 flex-shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground shadow-xl"
    >
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Comments</h2>
          {open.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px]"
              aria-label={`${open.length} open comments`}
            >
              {open.length} open
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Click to open in preview · hover or focus to send or delete
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {open.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              Enter Comment mode and click an element in the preview to add a comment.
            </div>
          ) : (
            open.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                selected={selectedCommentId === c.id}
                onSelect={onSelectComment}
                onSend={onSendComment}
                onDelete={onDeleteComment}
              />
            ))
          )}

          {resolved.length > 0 && (
            <Collapsible className="mt-2">
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/60">
                <span>Resolved ({resolved.length})</span>
                <ChevronDown className="size-3.5 transition-transform group-data-[panel-open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 flex flex-col gap-2">
                {resolved.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    selected={selectedCommentId === c.id}
                    onSelect={onSelectComment}
                    onDelete={onDeleteComment}
                    dimmed
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex flex-col gap-2 p-3">
        {unsentCount > 0 && (
          <Button
            size="sm"
            onClick={onSendAllUnsent}
            title={`Send ${unsentCount} unsent comment${unsentCount === 1 ? '' : 's'} to the agent`}
          >
            <Send />
            <span>Send {unsentCount} comment{unsentCount === 1 ? '' : 's'} to agent</span>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onCopyExport}>
          <Copy />
          <span>Copy agent context</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={reload}>
          <RefreshCw />
          <span>Refresh</span>
        </Button>
      </div>
    </aside>
  );
}
