/** Comment lifecycle helpers (browser + Node). */

export const COMMENT_OPEN = 'open';
export const COMMENT_RESOLVED = 'resolved';

export function normalizeComment(c) {
  const status = c?.status === COMMENT_RESOLVED ? COMMENT_RESOLVED : COMMENT_OPEN;
  return {
    sentToAgent: false,
    ...c,
    status,
  };
}

export function isOpenComment(c) {
  return c?.status !== COMMENT_RESOLVED;
}

export function filterOpenComments(comments) {
  return (comments || []).map(normalizeComment).filter(isOpenComment);
}

export function formatMentionedElementBlock(ctx, commentText) {
  const lines = [
    '<mentioned-element>',
    ctx?.artboardId
      ? `artboard: ${ctx.sectionId || 'main'}/${ctx.artboardId}${ctx.artboardLabel ? ` (${ctx.artboardLabel})` : ''}`
      : null,
    ctx?.react ? `react: ${ctx.react}` : null,
    ctx?.dom ? `dom: ${ctx.dom}` : null,
    ctx?.ref ? `id: ${ctx.ref}` : null,
    commentText ? `comment: ${commentText}` : null,
    '</mentioned-element>',
  ].filter(Boolean);
  return lines.join('\n');
}

export function commentToMentionedBlock(c) {
  const contexts = c.contexts?.length ? c.contexts : c.context ? [c.context] : [];
  if (contexts.length > 1) {
    return contexts.map((ctx) => formatMentionedElementBlock(ctx, c.text)).join('\n\n');
  }
  if (contexts[0]) return formatMentionedElementBlock(contexts[0], c.text);
  return `comment: ${c.text}`;
}

export function buildAgentFeedbackMarkdown(designName, comments, questions) {
  const open = filterOpenComments(comments);
  const blocks = [
    `# Agent feedback — ${designName}`,
    '',
    'Open items only. Resolved comments are omitted. Poll inbox for urgent sends.',
    '',
  ];
  if (questions?.status === 'answered' && questions.answers) {
    blocks.push('## Refinement answers', '');
    for (const q of questions.questions || []) {
      const ans = questions.answers[q.id];
      if (ans == null || ans === '') continue;
      const label = q.title || q.prompt || q.id;
      blocks.push(`- **${label}** ${Array.isArray(ans) ? ans.join(', ') : ans}`);
    }
    blocks.push('');
  }
  if (open.length) {
    blocks.push('## Inline comments (open)', '');
    for (const c of open) {
      blocks.push(commentToMentionedBlock(c));
      blocks.push('');
    }
  }
  const inbox = open.filter((c) => c.sentToAgent);
  if (inbox.length) {
    blocks.push('## Sent to agent (priority)', '');
    for (const c of inbox) {
      blocks.push(`- [${c.id}] ${c.text}`);
    }
    blocks.push('');
  }
  if (blocks.length <= 4) blocks.push('_No open feedback._', '');
  return blocks.join('\n');
}

export function buildAgentInboxPayload(comments) {
  const items = filterOpenComments(comments).filter((c) => c.sentToAgent);
  return {
    updatedAt: new Date().toISOString(),
    count: items.length,
    comments: items,
  };
}

export function buildAgentInboxMarkdown(designName, inbox) {
  const blocks = [
    `# Agent inbox — ${designName}`,
    '',
    'User sent these comments directly. Acknowledge via `comments resolve` or MCP after handling.',
    '',
  ];
  if (!inbox?.comments?.length) {
    blocks.push('_Inbox empty._', '');
    return blocks.join('\n');
  }
  for (const c of inbox.comments) {
    blocks.push(commentToMentionedBlock(c));
    blocks.push('');
  }
  return blocks.join('\n');
}
