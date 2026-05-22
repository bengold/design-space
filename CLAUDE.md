# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read [AGENTS.md](./AGENTS.md) first** — it is the canonical agent workflow doc (file layout under `designs/`, CLI usage, canvas/tweak state contracts, design-quality guidance distilled from hosted Claude Design). Treat the notes below as a quick orientation; AGENTS.md has the details.

For the underlying Claude Design system prompt (humans-only reference), see [docs/claude-design-prompt.extracted.md](docs/claude-design-prompt.extracted.md).

## Common commands

```bash
npm install
npx design-space dev [--design <name>] [--port <n>]   # Vite host on http://localhost:5173/
npx design-space url                                  # print the URL agents/humans should open
npx design-space list                                 # list designs in designs/
npx design-space use <name>                           # switch active design (writes designs/active.json)
npx design-space scaffold <name> [--title <t>]        # copy designs/_template/ → designs/<name>/
npx design-space validate [<name>]                    # static check on Design.jsx + tweak keys
npx design-space state get | state set <json|->       # public/.design-canvas.state.json (section order, labels, hidden)
npx design-space tweaks get|set|merge --design <name>
npx design-space questions ask|wait|get|set|dismiss   # refinement modal — agent-triggered, not on page load
npx design-space comments get|resolve|send
npx design-space inbox get                            # priority comments the user "sent to agent"
npx design-space overrides get|set                    # Edit-mode text/style overrides by data-ds-ref
npx design-space feedback export                      # writes/reads agent-feedback.md
npx design-space events poll --design <name> --since <iso>   # consume events.jsonl since last poll
npx design-space mcp install <cursor|cursor-global|claude-desktop>   # write host config
npx design-space doctor                               # diagnose CLI/MCP/plugin setup
npm run mcp                                           # run the MCP server directly (stdio)
npm run build:mcp                                     # rebuild mcp-server/dist/index.mjs (commit the bundle)
npm test                                              # vitest: core helpers + CLI smoke
npm run test:watch                                    # vitest in watch mode
npm run lint                                          # ESLint flat config
npm run format / npm run format:check                 # Prettier
npm run build                                         # vite build (host + preview entries)
```

`design-space validate` is the only static check for tweak/Design.jsx parity; `npm test` covers the CLI/core round-trips.

## Architecture

Two Vite entrypoints; the host loads the preview as an iframe:

- **Host** — `index.html` → `src/host/main.jsx` → `HostApp.jsx`. Provides the toolbar (design picker, zoom, Comment, Edit, Feedback, Tweaks), the questions modal (`QuestionsPanel.jsx`), and the feedback sidebar (`ReviewSidebar.jsx`). Talks to the iframe via `useDesignHostBridge.js` (postMessage).
- **Preview** — `preview.html` → `src/preview/main.jsx`. `designLoader.js` reads `designs/active.json` and dynamically imports `designs/<name>/Design.jsx`. `useDesignTweaks.js` is the live-tweaks hook; `tweakStorage.js` persists overrides; `persistDesignFile.js` writes back to disk via the Vite middleware.
- **Canvas/tweaks runtime** — `src/lib/design-canvas.jsx` (Figma-style pan/zoom/sections/artboards), `src/lib/tweaks-panel.jsx` (floating panel + edit-mode postMessage protocol), `src/lib/design-review.jsx` + `edit-panel.jsx` + `selection-picker.jsx` (Comment/Edit modes, CSS inspector). Avoid editing these unless fixing the host — agent work belongs in `designs/<name>/Design.jsx`.
- **Persistence bridge** — `vite.config.js` adds `persistPlugin()` exposing `POST /api/write` and `POST /api/append`. Writes are gated by an **allow-list** centralized in `lib/design-space-core.mjs` (`isAllowedWrite`, `isAllowedAppend`) — restricted to `designs/<name>/(tweaks|comments|questions|overrides).json`, `agent-feedback.md`, `agent-inbox.{json,md}`, `events.jsonl`, and `public/.design-canvas.state.json`. Anything outside fails 403; the same regex protects the CLI + MCP. **If you add a new on-disk artifact, update the allow-list there.** The middleware also requires loopback Origin so `vite --host` can't expose `/api/write` to the LAN.
- **CLI + MCP share core** — `bin/design-space.mjs` (CLI) and `mcp-server/index.mjs` (stdio MCP) both call functions on `lib/design-space-core.mjs` (`openQuestions`, `waitForQuestions`, `exportAgentFeedback`, `resolveCommentsFs`, etc.). The MCP server no longer spawns the CLI as a subprocess — keep new tools as direct lib calls.
- **Project-root discovery** — `lib/design-space-core.mjs:findProjectRoot()` resolves `ROOT` from `$DESIGN_SPACE_ROOT` first, then by walking up from `cwd()` for `designs/active.json`, then by the script's own location. This is what lets the MCP server work when launched from outside the repo (e.g. from a Claude Code plugin install).

## Per-design files (under `designs/<name>/`)

- `Design.jsx` — agent-owned React entry; wraps screens in `<DesignCanvas>` → `<DCSection>` → `<DCArtboard id label width height>`. Imports from `../../src/lib/design-canvas.jsx` and `../../src/lib/tweaks-panel.jsx`; uses `useDesignTweaks` from `../../src/preview/useDesignTweaks.js`.
- `tweaks.defaults.json` — agent-owned defaults. Keys must line up with `t.*` reads in `Design.jsx` and with `<Tweak*>` controls; `validate` checks this.
- `tweaks.json`, `comments.json`, `overrides.json`, `events.jsonl`, `agent-inbox.json` — gitignored runtime state written by the host. Read via CLI/MCP, not by parsing files directly when you can avoid it.
- `questions.json` — refinement Q&A; status flips to `"answered"` on submit.
- `agent-feedback.md` — merged human feedback for agents, regenerated on submit.
- `meta.json` — title/description.

## Plugin + host integrations

- **Skill (any agent)** — `skills/design-space/SKILL.md` follows the open [Agent Skills](https://skills.sh) format. Cross-agent install: `npx skills add bengold/design-space` symlinks the skill into Claude Code, Cursor, Codex, Copilot, etc.
- **Claude Code plugin + marketplace** — `.claude-plugin/marketplace.json` registers a one-plugin marketplace whose source is the repo root; `.claude-plugin/plugin.json` is the plugin manifest. Install via `/plugin marketplace add bengold/design-space` then `/plugin install design-space@design-space`. The plugin's MCP server is the pre-bundled file at `mcp-server/dist/index.mjs` (regenerated by `npm run build:mcp`, committed to git — CI verifies it's up to date).
- **Cursor / Claude Desktop MCP config** — `.cursor/mcp.json` is gitignored; generate it with `npx design-space mcp install <cursor|cursor-global|claude-desktop>`. Example shape at `.cursor/mcp.example.json`.

When editing `skills/design-space/SKILL.md`, keep the directory name matching `name:` in the frontmatter, both lowercase-hyphen (`^[a-z0-9]+(-[a-z0-9]+)*$`) — that's the constraint `npx skills` enforces.

When editing the MCP server (`mcp-server/index.mjs` or anything it imports from `lib/`), run `npm run build:mcp` and commit the regenerated `mcp-server/dist/index.mjs` — the plugin install consumes the bundle, not the source.

## Invariants worth knowing

- **Stable artboard `id`s** — `public/.design-canvas.state.json` keys section state on the joined artboard ids (`srcKey`). Renaming/reordering ids in `Design.jsx` resets canvas state.
- **Tweak key parity** — `tweaks.defaults.json`, the `FALLBACK_DEFAULTS` arg to `useDesignTweaks`, and `<Tweak*>` `path`s must all match, or `validate` fails.
- **Refinement questions are agent-triggered** — they do not appear on page load. Use `questions ask` then block on `questions wait` (or poll `questions get`); no push notification.
- **Events are the human→agent channel** — every comment/override write appends a line to `events.jsonl`. Poll with `events poll --since <iso>` rather than re-reading whole files.
- **Don't add unpinned CDN React/Babel in artboards** — Vite bundles modules; keep `Design.jsx` self-contained React.
