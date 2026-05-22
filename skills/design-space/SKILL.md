---
name: design-space
description: >-
  Work with Design Space — local Claude Design host. Use when editing designs/<name>/Design.jsx,
  reading human comments/overrides, asking refinement questions, polling review events, or running
  design-space CLI / MCP tools.
---

# Design Space (agent workflow)

## Scope

Edit `designs/<name>/` (Design.jsx, tweaks, pages). **Do not edit the host runtime** (`src/host/`, `src/lib/`, `src/preview/`, `vite.config.js`, `lib/design-space-core.mjs`, `bin/`, `mcp-server/`) unless the human explicitly says they're working on the host. See AGENTS.md → "Scope: which files to touch".

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
- `design_space_dom_snapshot` — pretty-printed rendered DOM (React component names stamped). The host writes this on Edit mode entry and after every override edit, so it reflects what the user currently sees. Use this to diff source against rendered structure when the comment payload alone is ambiguous.

## Comment payload

Each `<mentioned-element>` block is multi-line, mid-truncated at ~100 chars per line:

```
<mentioned-element>
artboard: main/dashboard (Dashboard)
source:   designs/demo/Design.jsx:42
react:    Design › DashboardPage › Card › Button
dom:      div#root › main.dashboard › ... › button.primary[3/4]
text:     "Send" · aria-label: "Send message"
children: svg, text
id:       dashboard:0.2.1.3
comment:  …
</mentioned-element>
```

Use `source:` (file:line) to jump straight to JSX — don't grep first. `react:` chains the named component path; `dom:` is the full DOM hop chain with indices for non-unique siblings.

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

The modal does not appear on page load — `ask` is required. `wait` blocks until the user resolves the modal in either direction:

- `status: "answered"` → use `answers` to continue.
- `status: "dismissed"` (with `dismissReason: "user"` or `"idle"`) → user closed the modal without answering. Don't retry immediately; surface the situation to the user before re-asking.

A `questions.dismissed` event is also appended to `events.jsonl`, so anything blocked on `design_space_events_wait` will unblock too.

## Overrides format

`overrides.json` → `{ "byRef": { "ds-3": { "styles": { "fontSize": "18px", ... }, "cssText": "...", "textContent": "..." } } }`

Element refs are assigned at pick time (`data-ds-ref`). Prefer promoting stable `data-ds-anchor` in JSX for long-lived targets.

## Project root discovery

The MCP server resolves the project root from `$DESIGN_SPACE_ROOT` if set, otherwise by walking up from `cwd()` looking for `designs/active.json`. Run Claude Code from inside a Design Space repo, or set `DESIGN_SPACE_ROOT` to the repo path.

## Full reference

See repo **AGENTS.md** and **README.md** for canvas state shape, tweak control catalogue, and design quality guidance.
