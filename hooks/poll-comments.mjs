#!/usr/bin/env node
/**
 * Design Space — UserPromptSubmit hook.
 *
 * Reads events.jsonl for the active design and prints any activity since the
 * last poll. Claude Code captures stdout and injects it as additional context
 * for the next turn — so the agent sees new comments / edits without having to
 * be told to look for them.
 *
 * State (last-poll timestamp) is kept per-design in CLAUDE_PLUGIN_DATA, falling
 * back to .claude/design-space/ inside the project root.
 */
import fs from 'node:fs';
import path from 'node:path';

const projectRoot =
  process.env.DESIGN_SPACE_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const designsDir = path.join(projectRoot, 'designs');
const activeFile = path.join(designsDir, 'active.json');

if (!fs.existsSync(activeFile)) process.exit(0);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const active = readJson(activeFile, null)?.name;
if (!active) process.exit(0);

const designDir = path.join(designsDir, active);
const eventsFile = path.join(designDir, 'events.jsonl');
if (!fs.existsSync(eventsFile)) process.exit(0);

const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(projectRoot, '.claude', 'design-space');
fs.mkdirSync(dataDir, { recursive: true });
const stateFile = path.join(dataDir, `${active}-last-poll.iso`);
const lastPoll = (fs.existsSync(stateFile) && fs.readFileSync(stateFile, 'utf8').trim()) || '';

const events = [];
for (const line of fs.readFileSync(eventsFile, 'utf8').split('\n')) {
  if (!line) continue;
  try {
    const ev = JSON.parse(line);
    if (ev.at && (!lastPoll || ev.at > lastPoll)) events.push(ev);
  } catch {
    /* skip malformed */
  }
}

// Always advance the watermark so subsequent turns only see fresh activity.
fs.writeFileSync(stateFile, new Date().toISOString());

if (events.length === 0) process.exit(0);

const byType = events.reduce((acc, ev) => {
  acc[ev.type] = (acc[ev.type] || 0) + 1;
  return acc;
}, {});
const newComments = events.filter((e) => e.type === 'comment.added');
const sentComments = events.filter((e) => e.type === 'comment.sent');
const deletedComments = events.filter((e) => e.type === 'comment.deleted');
const overrideUpdates = events.filter((e) => e.type === 'override.updated');

const lines = [];
lines.push(`<design-space-activity design="${active}">`);
lines.push(
  `${events.length} new event(s) since ${lastPoll || 'session start'}: ${Object.entries(byType)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')}`,
);
if (newComments.length) {
  const refs = newComments.flatMap((e) => e.refs || []).slice(0, 8);
  lines.push(`- new comments on refs: ${refs.join(', ')}`);
  lines.push(`  Read with the design_space_feedback_get MCP tool to see the text and targets.`);
}
if (sentComments.length) {
  lines.push(
    `- ${sentComments.length} comment(s) sent to agent. Check design_space_inbox_get — these were marked urgent.`,
  );
}
if (overrideUpdates.length) {
  const refs = [...new Set(overrideUpdates.map((e) => e.ref).filter(Boolean))].slice(0, 8);
  lines.push(`- ${overrideUpdates.length} style override update(s) on refs: ${refs.join(', ')}`);
  lines.push(
    `  These are user edits via the Edit panel — saved to designs/${active}/overrides.json.`,
  );
}
if (deletedComments.length) {
  lines.push(`- ${deletedComments.length} comment(s) deleted (resolved or discarded)`);
}
lines.push(`</design-space-activity>`);

console.log(lines.join('\n'));
