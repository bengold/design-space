import {
  buildAgentFeedbackMarkdown,
  buildAgentInboxMarkdown,
  buildAgentInboxPayload,
  normalizeComment,
} from '../../lib/comment-utils.mjs';
import { writeDesignFile } from '../preview/persistDesignFile.js';
import { appendReviewEvent } from './review-events.js';

export async function persistCommentsBundle(designName, comments, questions) {
  const normalized = comments.map(normalizeComment);
  await writeDesignFile(`designs/${designName}/comments.json`, { comments: normalized });
  await writeDesignFile(
    `designs/${designName}/agent-feedback.md`,
    buildAgentFeedbackMarkdown(designName, normalized, questions),
  );
  const inbox = buildAgentInboxPayload(normalized);
  await writeDesignFile(`designs/${designName}/agent-inbox.json`, inbox);
  await writeDesignFile(
    `designs/${designName}/agent-inbox.md`,
    buildAgentInboxMarkdown(designName, inbox),
  );
  return normalized;
}

export async function sendCommentToAgent(designName, comments, questions, commentId) {
  const next = comments.map((c) =>
    c.id === commentId
      ? { ...normalizeComment(c), sentToAgent: true, sentAt: new Date().toISOString() }
      : normalizeComment(c),
  );
  await persistCommentsBundle(designName, next, questions);
  await appendReviewEvent(designName, 'comment.sent', { commentId });
  return next;
}

export async function updateCommentText(designName, comments, questions, commentId, text) {
  const next = comments.map((c) =>
    c.id === commentId ? { ...normalizeComment(c), text } : normalizeComment(c),
  );
  await persistCommentsBundle(designName, next, questions);
  await appendReviewEvent(designName, 'comment.updated', { commentId });
  return next;
}

export async function deleteComment(designName, comments, questions, commentId) {
  const next = comments.filter((c) => c.id !== commentId);
  await persistCommentsBundle(designName, next, questions);
  await appendReviewEvent(designName, 'comment.deleted', { commentId });
  return next;
}

export async function resolveComments(designName, comments, questions, ids) {
  const resolveAll = !ids?.length;
  const idSet = ids?.length ? new Set(ids) : null;
  const next = comments.map((c) => {
    const n = normalizeComment(c);
    if (n.status === 'resolved') return n;
    if (!resolveAll && !idSet.has(c.id)) return n;
    return {
      ...n,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'agent',
      sentToAgent: false,
    };
  });
  const resolvedIds = next.filter((c) => c.status === 'resolved').map((c) => c.id);
  await persistCommentsBundle(designName, next, questions);
  await appendReviewEvent(designName, 'comment.resolved', { commentIds: resolvedIds });
  return next;
}
