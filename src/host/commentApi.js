import {
  deleteComment,
  persistCommentsBundle,
  resolveComments,
  sendCommentToAgent,
} from '../lib/comment-actions.js';

export async function fetchCommentsBundle(designName) {
  const [commentsRes, questionsRes] = await Promise.all([
    fetch(`/designs/${designName}/comments.json`),
    fetch(`/designs/${designName}/questions.json`),
  ]);
  const comments = commentsRes.ok ? (await commentsRes.json()).comments || [] : [];
  const questions = questionsRes.ok ? await questionsRes.json() : null;
  return { comments, questions };
}

export async function hostDeleteComment(designName, comments, questions, commentId) {
  return deleteComment(designName, comments, questions, commentId);
}

export async function hostSendComment(designName, comments, questions, commentId) {
  return sendCommentToAgent(designName, comments, questions, commentId);
}

export async function hostResolveComments(designName, comments, questions, ids) {
  return resolveComments(designName, comments, questions, ids);
}

export { persistCommentsBundle };
