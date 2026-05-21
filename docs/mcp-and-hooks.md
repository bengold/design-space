# Design Space — MCP, events, and hooks

## Recommended agent integration

### 1. MCP server (best for Cursor / Claude Desktop)

The repo ships a stdio MCP server that wraps the CLI and reads disk state directly.

```bash
npm install
```

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "design-space": {
      "command": "node",
      "args": ["/absolute/path/to/design-space/mcp-server/index.mjs"]
    }
  }
}
```

**Tools:** `design_space_feedback_get`, `design_space_events_poll`, `design_space_questions_ask`, `design_space_questions_wait`, `design_space_feedback_export`.

Load the project skill: `.cursor/skills/design-space/SKILL.md`.

### 2. Event log (how agents detect new comments/edits)

Every comment and override write appends one line to `designs/<name>/events.jsonl`:

```json
{"at":"2026-05-21T16:40:00.000Z","type":"comment.added","design":"demo","commentId":"c-…","refs":["ds-2"]}
{"at":"…","type":"override.updated","design":"demo","ref":"ds-5","keys":["fontSize","color"]}
```

**Poll from terminal:**

```bash
npx design-space events poll --design demo --since "2026-05-21T16:00:00.000Z"
```

**Agent loop:** remember `since` from last poll → poll after telling the user to review → if events non-empty, `feedback export` and edit `Design.jsx`.

### 3. Cursor hooks (optional)

You can add a **file watcher hook** that nudges the agent when `events.jsonl` changes — useful if you are not using MCP polling.

Example `.cursor/hooks.json` pattern (pseudo — adapt to your hook runner):

- **Trigger:** file change on `designs/*/events.jsonl`
- **Action:** inject “New design feedback — run `design-space events poll`”

Hooks are project-specific; MCP + `events poll` is the portable default.

## Human UX (preview)

| Mode        | Behavior                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| **Comment** | Blue hover outline, orange selection, Shift+multi, drag box-select, ↑ parent ↓ child ←→ siblings, Enter to compose |
| **Edit**    | Same picker; right panel with Layout / Flex / Spacing / Typography / Fill / Border / Effects + custom CSS          |
| **Tweaks**  | Global design tokens (unchanged)                                                                                   |

## Why not only `agent-feedback.md`?

The markdown file is a **snapshot** for one-shot reads. `events.jsonl` gives **incremental** “what changed since my last turn” — closer to how agents should work in long sessions.
