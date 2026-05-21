---
name: design-space
description: >-
  Work with Design Space — local Claude Design host. Use when editing designs/<name>/Design.jsx,
  reading human comments/overrides, asking refinement questions, polling review events, or running
  design-space CLI / MCP tools.
---

# Design Space (agent workflow)

## Architecture

| Layer       | Role                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| **Browser** | Human: Comment / Edit / Tweaks / canvas                                              |
| **Disk**    | Source of truth: `comments.json`, `overrides.json`, `events.jsonl`, `questions.json` |
| **CLI**     | `npx design-space …` — scripts and CI                                                |
| **MCP**     | `npm run mcp` — Cursor/Codex tools that wrap CLI + file reads                        |

**Do not** rely on page load for questions. Use **`questions ask`** then **`questions wait`**.

**Do** poll human feedback with **`events poll`** or MCP **`design_space_events_poll`** (after comments/edits).

## MCP setup (Cursor)

Add to `.cursor/mcp.json` (use absolute path):

```json
{
  "mcpServers": {
    "design-space": {
      "command": "node",
      "args": ["/Users/you/GitHub/design-space/mcp-server/index.mjs"]
    }
  }
}
```

Run `npm install` in the repo first.

### MCP tools

- `design_space_feedback_get` — comments + overrides + questions + agent-feedback.md
- `design_space_inbox_get` — priority comments user **sent to agent**
- `design_space_events_poll` — `{ since: "2026-05-21T12:00:00.000Z" }` for new activity
- `design_space_questions_ask` / `design_space_questions_wait`
- `design_space_comments_resolve` — dismiss when done (`commentIds` optional = all open)
- `design_space_feedback_export`

## Human → agent loop

1. User adds **Comment** (click/drag/multi-select, ↑↓←→ tree) or **Edit** (full CSS panel).
2. Preview appends **`events.jsonl`**: `comment.added`, `override.updated`.
3. Agent polls:

```bash
npx design-space events poll --design demo --since "2026-05-21T16:00:00.000Z"
```

4. Agent reads bundle:

```bash
npx design-space feedback export --design demo
# or: comments get / overrides get
```

5. Apply changes in `Design.jsx` / `tweaks.defaults.json` (promote overrides into code when appropriate).

## Refinement questions

```bash
npx design-space questions ask --design demo '{"title":"Refine","questions":[...]}'
npx design-space questions wait --design demo
```

## Overrides format

`overrides.json` → `{ "byRef": { "ds-3": { "styles": { "fontSize": "18px", ... }, "cssText": "...", "textContent": "..." } } }`

Element refs are assigned at pick time (`data-ds-ref`). Prefer promoting stable `data-ds-anchor` in JSX for long-lived targets.

## Full reference

See repo **AGENTS.md** and **README.md**.
