import { useCallback, useEffect, useState } from 'react';
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
    <Badge className="text-[10px] font-medium" variant="default">
      Open
    </Badge>
  );
}

function CommentRow({ comment, selected, onSelect, onSend, onDelete, dimmed }) {
  const status = statusOf(comment);
  const ctx = comment.contexts?.[0] || comment.context;
  const canSend = status === 'open';
  const canDelete = status !== 'resolved';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(comment.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect?.(comment.id);
      }}
      className={cn(
        'group cursor-pointer rounded-lg border p-2.5 text-sm transition-colors',
        selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/60',
        dimmed && 'opacity-70',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <div
          className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {canSend && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Send this comment to the agent"
              onClick={() => onSend?.(comment.id)}
            >
              <Send />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete this comment"
              onClick={() => onDelete?.(comment.id)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <div
        className={cn(
          'leading-snug text-foreground',
          status === 'resolved' && 'line-through text-muted-foreground',
        )}
      >
        {comment.text}
      </div>
      {ctx?.artboardLabel && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">{ctx.artboardLabel}</div>
      )}
    </div>
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
  const unsentCount = open.filter((c) => !c.sentToAgent).length;

  return (
    <aside className="ds-review-ui flex h-full w-80 flex-shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground shadow-xl">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <strong className="text-sm">Comments</strong>
          {open.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {open.length} open
            </Badge>
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Click to open in preview · hover to send or delete
        </div>
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
            <span>Send {unsentCount} to agent</span>
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
