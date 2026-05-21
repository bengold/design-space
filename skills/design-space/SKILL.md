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

**Auto-polling**: the plugin ships a `UserPromptSubmit` hook that scans `events.jsonl` and injects a `<design-space-activity>` block into each turn's context. When you see that block, fetch the details with **`design_space_feedback_get`** (full bundle) or **`design_space_inbox_get`** (urgent sends only) — you do not need to call `design_space_events_poll` separately for the routine case.

## MCP tools

- `design_space_active_get` — current active design name
- `design_space_feedback_get` — comments + overrides + questions + `agent-feedback.md`
- `design_space_inbox_get` — priority comments the user **sent to agent**
- `design_space_events_poll` — `{ since: "<iso>" }` for new activity
- `design_space_events_wait` — **blocking** poll. Returns when new events land in `events.jsonl`, or after `timeout` seconds. Use to loop on feedback without a fresh user prompt: `wait → handle → resolve → wait`.
- `design_space_questions_ask` / `design_space_questions_wait`
- `design_space_comments_resolve` — dismiss when done (`commentIds` optional = all open)
- `design_space_feedback_export` — regenerate `agent-feedback.md`

## Comment payload

Each comment context now includes a `source` field with the JSX file + line that owns the targeted element (via React fiber `_debugSource`, e.g. `designs/demo/Design.jsx:42`). When the agent receives a `<mentioned-element>` block, use the `source:` line to jump directly to the relevant JSX — don't grep first.

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
