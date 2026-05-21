/**
 * Shared disk paths + event parsing for CLI and MCP (no Vite dependency).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAgentFeedbackMarkdown,
  buildAgentInboxMarkdown,
  buildAgentInboxPayload,
  normalizeComment,
} from './comment-utils.mjs';

function findProjectRoot() {
  if (process.env.DESIGN_SPACE_ROOT) {
    return path.resolve(process.env.DESIGN_SPACE_ROOT);
  }
  // Walk up from CWD looking for designs/active.json (a project sentinel).
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'designs', 'active.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: parent of this lib/ — works for `npx design-space` from inside the repo.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

const ROOT = findProjectRoot();
const DESIGNS = path.join(ROOT, 'designs');
const ACTIVE_FILE = path.join(DESIGNS, 'active.json');

export function getRoot() {
  return ROOT;
}

const DESIGN_NAME = '[a-z0-9][a-z0-9_-]*';
const WRITE_PATTERNS = [
  new RegExp(`^designs/${DESIGN_NAME}/(tweaks|comments|questions|overrides)\\.json$`),
  new RegExp(`^designs/${DESIGN_NAME}/agent-feedback\\.md$`),
  new RegExp(`^designs/${DESIGN_NAME}/agent-inbox\\.(json|md)$`),
  new RegExp(`^designs/${DESIGN_NAME}/events\\.jsonl$`),
];
const APPEND_PATTERNS = [new RegExp(`^designs/${DESIGN_NAME}/events\\.jsonl$`)];

export function isAllowedWrite(relPath) {
  if (relPath === '.design-canvas.state.json') return true;
  return WRITE_PATTERNS.some((re) => re.test(relPath));
}

export function isAllowedAppend(relPath) {
  return APPEND_PATTERNS.some((re) => re.test(relPath));
}

export function resolveWriteTarget(relPath) {
  if (relPath === '.design-canvas.state.json') {
    return path.join(ROOT, 'public', relPath);
  }
  return path.join(ROOT, relPath);
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function getActiveDesign() {
  return readJson(ACTIVE_FILE, { name: 'demo' })?.name || 'demo';
}

export function designPath(name, filename) {
  return path.join(DESIGNS, name, filename);
}

export function readEvents(name, since = null) {
  const file = designPath(name, 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  const events = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!since) return events;
  return events.filter((e) => e.at > since);
}

export function appendEventLine(name, event) {
  const file = designPath(name, 'events.jsonl');
  const line = JSON.stringify({ at: new Date().toISOString(), design: name, ...event }) + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line, 'utf8');
}

export function persistCommentsBundleFs(name, comments, questions) {
  const normalized = (comments || []).map(normalizeComment);
  writeJson(designPath(name, 'comments.json'), { comments: normalized });
  fs.writeFileSync(
    designPath(name, 'agent-feedback.md'),
    buildAgentFeedbackMarkdown(name, normalized, questions),
    'utf8',
  );
  const inbox = buildAgentInboxPayload(normalized);
  writeJson(designPath(name, 'agent-inbox.json'), inbox);
  fs.writeFileSync(
    designPath(name, 'agent-inbox.md'),
    buildAgentInboxMarkdown(name, inbox),
    'utf8',
  );
  return normalized;
}

export function resolveCommentsFs(name, ids) {
  const data = readJson(designPath(name, 'comments.json'), { comments: [] });
  const questions = readJson(designPath(name, 'questions.json'), null);
  const resolveAll = !ids?.length;
  const idSet = ids?.length ? new Set(ids) : null;
  const next = (data.comments || []).map((c) => {
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
  persistCommentsBundleFs(name, next, questions);
  appendEventLine(name, {
    type: 'comment.resolved',
    commentIds: ids?.length ? ids : next.filter((c) => c.status === 'resolved').map((c) => c.id),
  });
  return next;
}

export function normalizeQuestionsPayload(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const questions = Array.isArray(body.questions) ? body.questions : body;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('questions ask requires a non-empty "questions" array');
  }
  return {
    title: body.title || 'Refinement questions',
    status: 'pending',
    trigger: 'open',
    questions,
    answers: body.answers || {},
  };
}

export function openQuestions(name, rawPayload) {
  const file = designPath(name, 'questions.json');
  let payload;
  if (rawPayload != null) {
    payload = normalizeQuestionsPayload(rawPayload);
  } else {
    const prev = readJson(file, null);
    if (!prev?.questions?.length) {
      throw new Error(
        'No questions.json or empty questions — pass a payload with a non-empty questions array',
      );
    }
    payload = { ...prev, status: 'pending', trigger: 'open', answers: prev.answers || {} };
  }
  writeJson(file, payload);
  return payload;
}

function sleepMs(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

export async function waitForQuestions(name, timeoutSec = 600, { signal } = {}) {
  const deadline = Date.now() + timeoutSec * 1000;
  const file = designPath(name, 'questions.json');
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('aborted');
    const q = readJson(file, null);
    if (q?.status === 'answered') return q;
    sleepMs(2000);
  }
  throw new Error(
    `Timed out after ${timeoutSec}s waiting for designs/${name}/questions.json status "answered"`,
  );
}

export function exportAgentFeedback(name) {
  const comments = readJson(designPath(name, 'comments.json'), { comments: [] }).comments || [];
  const questions = readJson(designPath(name, 'questions.json'), null);
  const md = buildAgentFeedbackMarkdown(name, comments, questions);
  fs.writeFileSync(designPath(name, 'agent-feedback.md'), md, 'utf8');
  return md;
}

export function loadFeedbackBundle(name) {
  const commentsFile = readJson(designPath(name, 'comments.json'), { comments: [] });
  const inboxPath = designPath(name, 'agent-inbox.json');
  return {
    design: name,
    questions: readJson(designPath(name, 'questions.json'), null),
    comments: commentsFile,
    openComments: (commentsFile.comments || []).filter((c) => c?.status !== 'resolved'),
    overrides: readJson(designPath(name, 'overrides.json'), { byRef: {} }),
    agentFeedbackPath: designPath(name, 'agent-feedback.md'),
    agentFeedback: fs.existsSync(designPath(name, 'agent-feedback.md'))
      ? fs.readFileSync(designPath(name, 'agent-feedback.md'), 'utf8')
      : null,
    agentInboxPath: inboxPath,
    agentInbox: readJson(inboxPath, { comments: [], count: 0 }),
    agentInboxMd: fs.existsSync(designPath(name, 'agent-inbox.md'))
      ? fs.readFileSync(designPath(name, 'agent-inbox.md'), 'utf8')
      : null,
    events: readEvents(name),
  };
}
