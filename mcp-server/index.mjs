#!/usr/bin/env node
/**
 * Design Space MCP — agents poll events, ask questions, read feedback without parsing the UI.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  appendEventLine,
  exportAgentFeedback,
  getActiveDesign,
  loadFeedbackBundle,
  openQuestions,
  readDomSnapshot,
  readEvents,
  resolveCommentsFs,
  waitForEvents,
  waitForQuestions,
} from '../lib/design-space-core.mjs';

const server = new Server(
  { name: 'design-space', version: '0.3.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'design_space_active_get',
      description: 'Get the active design name from designs/active.json',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'design_space_feedback_get',
      description: 'Read comments, overrides, questions, and agent-feedback.md for a design',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string', description: 'Design folder name (default: active)' },
        },
      },
    },
    {
      name: 'design_space_events_poll',
      description:
        'Poll events.jsonl for new human comments/edits since a timestamp (ISO). Use in a loop while user reviews.',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          since: { type: 'string', description: 'ISO timestamp; omit to get all events' },
          limit: { type: 'number', description: 'Max events to return (default 50)' },
        },
      },
    },
    {
      name: 'design_space_events_wait',
      description:
        'Block until new comments/edits land in events.jsonl. Returns the batch and lets the agent loop on user feedback without waiting for a prompt. Timeout in seconds (default 600).',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          since: {
            type: 'string',
            description: 'ISO timestamp; omit to start watching from now',
          },
          timeout: { type: 'number', description: 'Seconds to block before returning empty' },
        },
      },
    },
    {
      name: 'design_space_questions_ask',
      description:
        'Open refinement questions modal in the host (trigger=open). Pass questions JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          payload: { type: 'object', description: '{ title?, questions: [...] }' },
        },
        required: ['payload'],
      },
    },
    {
      name: 'design_space_questions_wait',
      description:
        'Block until user submits questions (status=answered). Timeout seconds default 600.',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          timeout: { type: 'number' },
        },
      },
    },
    {
      name: 'design_space_feedback_export',
      description: 'Regenerate agent-feedback.md from comments + questions',
      inputSchema: {
        type: 'object',
        properties: { design: { type: 'string' } },
      },
    },
    {
      name: 'design_space_inbox_get',
      description:
        'Read agent-inbox.json / agent-inbox.md — comments user sent directly to the agent',
      inputSchema: {
        type: 'object',
        properties: { design: { type: 'string' } },
      },
    },
    {
      name: 'design_space_dom_snapshot',
      description:
        'Read the latest pretty-printed DOM snapshot for a design. Captures the current rendered structure (with React component names) so the agent can diff what the user sees against the source Design.jsx. The host writes this on Edit mode entry and after each override edit; if missing, ask the user to open the design and enter Edit mode.',
      inputSchema: {
        type: 'object',
        properties: { design: { type: 'string' } },
      },
    },
    {
      name: 'design_space_comments_resolve',
      description:
        'Dismiss/resolve comments after handling. Omit commentIds to resolve all open comments.',
      inputSchema: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          commentIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  ],
}));

function text(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const design = args?.design || getActiveDesign();

  try {
    switch (name) {
      case 'design_space_active_get':
        return text({ design: getActiveDesign() });

      case 'design_space_feedback_get':
        return text(loadFeedbackBundle(design));

      case 'design_space_events_poll': {
        const since = args?.since || null;
        const limit = args?.limit ?? 50;
        let events = readEvents(design, since);
        if (events.length > limit) events = events.slice(-limit);
        return text({ design, since, count: events.length, events });
      }

      case 'design_space_events_wait': {
        const since = args?.since || null;
        const timeoutSec = args?.timeout ?? 600;
        const events = await waitForEvents(design, { since, timeoutSec });
        return text({ design, since, timedOut: events.length === 0, count: events.length, events });
      }

      case 'design_space_questions_ask': {
        const payload = openQuestions(design, args.payload);
        appendEventLine(design, { type: 'questions.opened', trigger: 'open' });
        return text({ design, opened: true, questions: payload });
      }

      case 'design_space_questions_wait': {
        const timeout = args?.timeout ?? 600;
        const answered = await waitForQuestions(design, timeout);
        return text(answered);
      }

      case 'design_space_feedback_export': {
        const md = exportAgentFeedback(design);
        return { content: [{ type: 'text', text: md }] };
      }

      case 'design_space_inbox_get': {
        const bundle = loadFeedbackBundle(design);
        return text({ inbox: bundle.agentInbox, markdown: bundle.agentInboxMd });
      }

      case 'design_space_dom_snapshot':
        return text(readDomSnapshot(design));

      case 'design_space_comments_resolve': {
        const ids = args?.commentIds || [];
        const next = resolveCommentsFs(design, ids);
        return text({ design, resolved: ids.length ? ids : 'all-open', comments: next });
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: 'text', text: err.message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
