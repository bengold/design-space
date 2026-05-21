# Design Space

A local host for Claude Design’s canvas and tweaks panel — built for **humans and coding agents** (Claude Code, Codex, Cursor). Agents edit `designs/<name>/Design.jsx` and JSON state on disk; you preview in the browser.

## Quick start

```bash
npm install
npx design-space dev
```

Open http://localhost:5173/ — toolbar shows active design, zoom, **Comment**, **Edit**, **Feedback**, and **Tweaks**.

**Refinement questions:** `design-space questions ask` opens the modal; `design-space questions wait` blocks until the user submits.

**Agent integration:** MCP server (`npm run mcp`), `events.jsonl` polling, and the bundled Claude Code / Cursor skills — see [docs/mcp-and-hooks.md](docs/mcp-and-hooks.md) and the install instructions below.

**Comment / Edit:** DevTools-style outlines, arrow-key tree walk, drag box-select (comments), Figma-like CSS inspector panel.

**Inline comments:** **Comment** mode → click elements in the preview; saved to `comments.json` for agents.

**Edit panel:** **Edit** mode → click an element to change text and basic styles; saved to `overrides.json`.

## For agents

Read **[AGENTS.md](./AGENTS.md)** — file layout, CLI, canvas state, design/tweak guidance distilled from Claude Design’s system prompt, and workflow.

For the underlying Claude Design system prompt (humans-only reference), see **[docs/claude-design-prompt.extracted.md](docs/claude-design-prompt.extracted.md)**.

```bash
npx design-space scaffold my-flow --title "My flow"
# edit designs/my-flow/Design.jsx
npx design-space validate my-flow
npx design-space dev
npx design-space tweaks get --design my-flow
npx design-space state get
```

`CLAUDE.md` points agents at the same doc.

## What’s included

| Piece                       | Role                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `designs/<name>/`           | Agent-editable designs (`Design.jsx`, tweak defaults)       |
| `src/lib/design-canvas.jsx` | Figma-style canvas (pan/zoom, sections, artboards, focus)   |
| `src/lib/tweaks-panel.jsx`  | Floating tweaks UI + edit-mode protocol                     |
| `src/lib/design-review.jsx` | Comment mode, edit panel, overrides, agent feedback export  |
| `src/host/`                 | Shell iframe + toolbar + questions modal + feedback sidebar |
| `bin/design-space.mjs`      | CLI for scaffold, state, tweaks, dev server                 |

## Persistence

| Data                 | Location                                     |
| -------------------- | -------------------------------------------- |
| Active design        | `designs/active.json`                        |
| Tweak defaults       | `designs/<name>/tweaks.defaults.json`        |
| Tweak overrides (UI) | `designs/<name>/tweaks.json` (gitignored)    |
| Refinement Q&A       | `designs/<name>/questions.json`              |
| Inline comments      | `designs/<name>/comments.json` (gitignored)  |
| Edit overrides       | `designs/<name>/overrides.json` (gitignored) |
| Agent-readable merge | `designs/<name>/agent-feedback.md`           |
| Canvas layout        | `public/.design-canvas.state.json`           |
| Viewport pan/zoom    | Browser `localStorage`                       |

## Scripts

- `npm run dev` — Vite dev server
- `npm run design -- <cmd>` — CLI shorthand
- `npx design-space <cmd>` — same CLI when linked globally
- `npm test` — vitest smoke suite (core helpers + CLI round-trip)
- `npm run lint` / `npm run format` — ESLint + Prettier

## Install as a Claude Code plugin

The repo ships a `.claude-plugin/plugin.json` that registers the MCP server and the `design-space` skill. From inside the repo:

```bash
claude plugin add ./.claude-plugin
```

The MCP server resolves the project root from `$DESIGN_SPACE_ROOT` (set automatically by the plugin to `$CLAUDE_PROJECT_DIR`), falling back to walking up from `cwd()` to find `designs/active.json`.

## Cursor / Claude Desktop setup

Write the MCP server config for any supported host:

```bash
npx design-space mcp install cursor          # writes ./.cursor/mcp.json
npx design-space mcp install cursor-global   # writes ~/.cursor/mcp.json
npx design-space mcp install claude-desktop  # writes the platform config
```

`.cursor/mcp.json` is gitignored — see `.cursor/mcp.example.json` for the shape.
