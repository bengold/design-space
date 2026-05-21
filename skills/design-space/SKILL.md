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
| **CLI**     | `npx design-space …` — scripts, hooks, and one-off commands                          |
| **MCP**     | `design_space_*` tools provided by this plugin                                       |

**Do not** rely on page load for questions. Use **`design_space_questions_ask`** then **`design_space_questions_wait`**.

**Do** poll human feedback with **`design_space_events_poll`** after the user comments/edits.

## MCP tools

- `design_space_active_get` — current active design name
- `design_space_feedback_get` — comments + overrides + questions + `agent-feedback.md`
- `design_space_inbox_get` — priority comments the user **sent to agent**
- `design_space_events_poll` — `{ since: "<iso>" }` for new activity
- `design_space_questions_ask` / `design_space_questions_wait`
- `design_space_comments_resolve` — dismiss when done (`commentIds` optional = all open)
- `design_space_feedback_export` — regenerate `agent-feedback.md`

## Human → agent loop

1. User adds **Comment** (click/drag/multi-select, ↑↓←→ tree) or **Edit** (full CSS panel).
2. Preview appends **`events.jsonl`**: `comment.added`, `override.updated`.
3. Agent polls with `design_space_events_poll` using the timestamp from the last poll.
4. Agent reads the bundle with `design_space_feedback_get`.
5. Apply changes in `Design.jsx` / `tweaks.defaults.json` (promote one-off overrides into code when they should stick).

## Refinement questions

```text
design_space_questions_ask  { payload: { title: "Refine", questions: [...] } }
design_space_questions_wait { timeout: 600 }
```

The modal does not appear on page load — `ask` is required. `wait` blocks until the user submits.

## Overrides format

`overrides.json` → `{ "byRef": { "ds-3": { "styles": { "fontSize": "18px", ... }, "cssText": "...", "textContent": "..." } } }`

Element refs are assigned at pick time (`data-ds-ref`). Prefer promoting stable `data-ds-anchor` in JSX for long-lived targets.

## Project root discovery

The MCP server resolves the project root from `$DESIGN_SPACE_ROOT` if set, otherwise by walking up from `cwd()` looking for `designs/active.json`. Run Claude Code from inside a Design Space repo, or set `DESIGN_SPACE_ROOT` to the repo path.

## Full reference

See repo **AGENTS.md** and **README.md** for canvas state shape, tweak control catalogue, and design quality guidance.
