# Design Space — agent instructions

Design Space is a **local Claude Design host** for coding agents (Claude Code, Codex, Cursor, etc.). Agents edit plain files; humans preview in the browser.

- **Agents:** this file (`AGENTS.md`) — distilled for local Design Space
- **Humans / reference:** [docs/claude-design-prompt.extracted.md](docs/claude-design-prompt.extracted.md) — text extract of the hosted Claude Design system prompt

## Scope: which files to touch

Most Design Space sessions are **design-authoring** — adding or editing designs under `designs/<name>/`. By default, scope your edits accordingly:

- **Edit freely:** files under `designs/<name>/` — `Design.jsx`, `tweaks.defaults.json`, `meta.json`, anything under `pages/`.
- **Read, don't edit:** the host runtime — `src/host/`, `src/lib/`, `src/preview/`, `vite.config.js`, `lib/design-space-core.mjs`, `bin/`, `mcp-server/`. These power the canvas, tweaks panel, comment/edit modes, and CLI for every design. Touching them is rarely what a design task needs and risks breaking the whole host.
- **Surface the exception, don't sneak it in:** if a host change really is the right fix (e.g. a canvas bug blocking the work), call it out and confirm before editing.

**Override:** the human can lift this scope for a session — e.g. _"we're working on the host UI today"_, _"edit src/host"_, or pointing you at a specific file under `src/`. Once lifted, treat host files like any other code (read first, follow existing patterns, run `npm test` and `npm run lint`).

## Parity: what agents can do

| Human (UI)                      | Agent equivalent                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| View canvas layout              | Read `public/.design-canvas.state.json` or `design-space state get`                                                                         |
| Reorder/rename/delete artboards | Edit `state set` JSON (`sections.<id>.order`, `labels`, `hidden`)                                                                           |
| Pan/zoom viewport               | Browser `localStorage` only (not agent-readable)                                                                                            |
| Change tweaks in panel          | Edit `designs/<name>/tweaks.defaults.json` or `design-space tweaks set/merge`                                                               |
| Create a new design             | `design-space scaffold <name>` then edit `designs/<name>/Design.jsx`                                                                        |
| Switch design                   | `design-space use <name>` or edit `designs/active.json`                                                                                     |
| Preview                         | `design-space dev` then open URL from `design-space url`                                                                                    |
| Refinement questions (modal)    | **`design-space questions ask`** — opens modal in host (`trigger: "open"`). Does **not** run on page load. Read answers via `questions get` |
| Inline comments on preview      | User: **Comment** mode + click elements. Agent: `comments get`, `feedback export`, or read `agent-feedback.md`                              |
| Quick text/style edits          | User: **Edit** mode. Agent: `overrides get` / `overrides set` — keyed by `data-ds-ref` on picked elements                                   |

## Repository layout

```
designs/
  active.json              # { "name": "demo" } — which design loads in preview
  <name>/
    Design.jsx             # React: DesignCanvas + artboards + TweaksPanel (YOU EDIT THIS)
    tweaks.defaults.json   # Default tweak values (agent-owned)
    tweaks.json            # Runtime overrides from UI (gitignored; optional)
    questions.json         # Refinement Q&A (agent writes; user answers in host modal)
    comments.json          # Inline comments from Comment mode (gitignored)
    overrides.json         # Edit-panel text/styles by element ref (gitignored)
    agent-feedback.md      # Merged export for agents (comments + answers)
    meta.json              # title, description
public/
  .design-canvas.state.json  # Section order, labels, hidden artboards
src/lib/
  design-canvas.jsx        # Canvas runtime (avoid editing unless fixing bugs)
  tweaks-panel.jsx         # Tweaks UI runtime
  design-review.jsx        # Comment/Edit modes + overrides
```

## Standard workflow

### 1. Start or create a design

```bash
npm install
npx design-space scaffold checkout --title "Checkout flow"
# or: npx design-space use demo
```

### 2. Implement UI in `Design.jsx`

- Wrap screens in `<DesignCanvas>` → `<DCSection>` → `<DCArtboard>`.
- Each artboard needs stable `id` and `label` props; set `width` / `height` (mobile frames often 260×480).
- Use `useDesignTweaks(designName, FALLBACK_DEFAULTS)` for live theme controls.
- Import from `../../src/lib/design-canvas.jsx` and `../../src/lib/tweaks-panel.jsx`.

Example artboard:

```jsx
<DCArtboard id="hero" label="Hero" width={320} height={560}>
  <YourComponent t={t} />
</DCArtboard>
```

### 3. Define tweak schema

Edit `designs/<name>/tweaks.defaults.json` — keys must match `t.*` usage and `<Tweak*>` controls in `Design.jsx`.

### 4. Validate and run

```bash
npx design-space validate checkout
npx design-space dev --design checkout
npx design-space url
```

Open the `host` URL in a browser. Use the toolbar **Tweaks** button to open the tweaks panel.

### 5. Read back human/session state

After the user rearranges the canvas or moves tweaks:

```bash
npx design-space state get
npx design-space tweaks get --design checkout
```

Apply their choices by updating `Design.jsx` / `tweaks.defaults.json` in your next edit.

## CLI reference

```bash
npx design-space dev [--design <name>] [--port <n>]
npx design-space list
npx design-space use <name>
npx design-space scaffold <name> [--title <title>]
npx design-space validate [<name>]
npx design-space url [--design <name>]
npx design-space state get
npx design-space state set '<json>'   # or: echo '{}' | design-space state set -
npx design-space tweaks get [--design <name>]
npx design-space tweaks set [--design <name>] primaryColor '"#2A6FDB"'
npx design-space tweaks merge [--design <name>] '{"fontSize":18}'
```

## Canvas state shape

`public/.design-canvas.state.json`:

```json
{
  "sections": {
    "onboarding": {
      "title": "Onboarding",
      "order": ["a", "b"],
      "labels": { "a": "A · Warm" },
      "hidden": [],
      "srcKey": "a\x1fb"
    }
  }
}
```

- `order`: artboard id order within the section.
- `hidden`: deleted artboard ids (scoped to `srcKey` — resets when artboard ids in `Design.jsx` change).
- `srcKey`: joined artboard ids; do not set manually unless you know the format.

## Pages: canvas vs raw

A design can have multiple pages via `<DCPage id title>`. Each page picks its own rendering style:

- **Canvas page** (default) — children are `<DCSection>`s of `<DCArtboard>`s. Renders inside the pan/zoom canvas with the usual chrome (grid, section titles, draggable artboards). Use for multi-artboard mockups where you want to compare variants.
- **Raw page** (`<DCPage … raw>`) — children render full-viewport, no canvas, no pan/zoom. Use for standalone showcases, interactive demos, complex single-screen designs, or anything where the infinite canvas would be in the way.

Both styles can coexist in one design. The active page lives in the host toolbar's page dropdown. `Cmd+]` / `Cmd+[` cycles.

```jsx
<DesignCanvas>
  <DCPage id="onboarding" title="Onboarding">
    <DCSection ...><DCArtboard ...>…</DCArtboard></DCSection>
  </DCPage>
  <DCPage id="cards" title="Cards" raw>
    <IridescentCardShowcase />
  </DCPage>
</DesignCanvas>
```

### Per-page tweaks

Each page registers its own tweaks by calling `useDesignTweaksDialKit(designName, pageConfig)` from inside its component. When the page is active those controls populate the floating Tweaks panel; switching pages unmounts the hook and the panel swaps to the new page's set. Values still **merge** in `tweaks.json` — fontSize from page A and suit from page B coexist on disk so switching back doesn't lose state.

## Choosing canvas vs tweaks (from Claude Design)

Pick the presentation format by what you are exploring:

| Goal                                                         | Approach in Design Space                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Purely visual** (color, type, static layout of one screen) | Multiple `<DCArtboard>` variants in one `Design.jsx`, grouped in `<DCSection>`                        |
| **Interactions, flows, or many options**                     | Hi-fi clickable prototype inside each artboard, with dimensions exposed as **Tweaks**                 |
| **Both**                                                     | Prototype per artboard side-by-side on the canvas — preferred over separate HTML files for variations |

**Prefer one design file with tweaks and artboards** over many loose files when exploring variants. Users can compare, reorder, focus fullscreen, and toggle tweaks in one place.

## Design canvas rules

- **Structure:** `<DesignCanvas>` → `<DCSection id title subtitle?>` → one or more `<DCArtboard id label width height>`.
- **Artboards are static frames, not scroll regions.** Do not use `height: 100%` with `overflow: auto/scroll` on inner content. Size the artboard to the design (`width` / `height` props), or let content define height — never the reverse.
- **Stable `id`s** on every artboard and section; labels can change, ids should not (canvas state keys off them).
- **Typical mobile frames:** 260×480, 280×560, 300×420 — adjust per content.
- **Human actions** (drag-reorder, rename, delete, focus) persist in `.design-canvas.state.json` — read with `state get` after review sessions.

## Annotating designs

Agents can drop sticky-note style annotations onto the canvas with `<DCPostIt top left right bottom rotate width>...</DCPostIt>` (imported from `src/lib/design-canvas.jsx`). Place them inside a `<DCSection>` next to the artboards they describe; positioning props are pixel offsets relative to the section grid.

- **Use sparingly:** post-its are a tool for leaving the user a note (open questions, callouts, “check this variant”), not for permanent design labels — that is what artboard `label` props are for.
- **Demo is clean on purpose:** `designs/demo/Design.jsx` ships with **no** `<DCPostIt>` so a fresh canvas renders without yellow stickies. Add them only when you have something to say, and remove them once acknowledged.

## Tweaks panel (adapted from Claude Design)

Hosted Claude Design persists tweaks via `/*EDITMODE-BEGIN*/` … `/*EDITMODE-END*/` inside HTML. **Here, use JSON files:**

- **Defaults (you own):** `designs/<name>/tweaks.defaults.json`
- **Runtime overrides (UI / user):** `designs/<name>/tweaks.json` — read with `tweaks get`

In `Design.jsx`:

```jsx
import {
  useDesignTweaks,
  TweaksPanel,
  TweakSection,
  TweakSlider,
  TweakColor,
  TweakRadio,
  TweakToggle,
} from '../../src/lib/tweaks-panel.jsx';

export default function Design({ designName = 'my-design' }) {
  const [t, setTweak] = useDesignTweaks(designName, { primaryColor: '#D97757', fontSize: 16 });
  // ...
}
```

**Control guidelines:**

- **Colors:** always pass **3–4 curated** `options` to `<TweakColor>` — avoid free-form pickers unless necessary. Palettes can be arrays: `options={[['#D97757','#29261b','#f6f4ef'], …]}`.
- **2–3 short labels:** `<TweakRadio>` (segmented). **Many or long labels:** `<TweakSelect>` (dropdown).
- **Panel title:** keep the default `"Tweaks"` — it matches the host toolbar toggle.
- **Hide when off:** the panel only shows when the user enables **Tweaks** in the host; the artboard should look final when off.
- **Add tweaks proactively:** even if the user did not ask, expose a few meaningful dimensions (color, density, copy variant, layout mode) so they can explore.

The tweaks runtime already handles `__edit_mode_*` postMessage to the host; you do not reimplement that protocol.

## Design process & exploration

1. **Clarify** for new or ambiguous work: output format, fidelity, number of variations, brand/design-system constraints.
2. **Gather context first** — existing UI, tokens, components, screenshots. Mocking a full product from scratch without context is a last resort.
3. **Plan** sections and artboards (todo list is fine for multi-screen work).
4. **Show early** — scaffold + placeholder artboards, then fill in React components.
5. **Iterate** — run `validate`, `dev`, read `tweaks get` / `state get` after user review.

**Variations:** aim for **3+ options** across meaningful dimensions (visual, interaction, density, color treatment). Mix on-pattern designs with bolder experiments. Expose variants as separate artboards and/or tweak-driven modes — not always new files.

**Placeholders:** if an asset is missing, use a simple striped/labelled placeholder — better than a bad hand-drawn SVG. Do not draw complex SVGs yourself (simple shapes only).

## Visual & content quality

- **No filler** — every element should earn its place; do not pad with dummy stats, icons, or lorem sections.
- **Ask before adding** large new sections or copy the user did not request.
- **Layout:** prefer `display: flex` or `grid` with `gap` for UI rows (buttons, chips, cards) — not inline-block siblings spaced by whitespace.
- **Color:** use brand tokens when available; otherwise harmonious **oklch** accents. Avoid inventing unrelated palettes each iteration.
- **Touch targets** in mobile artboards: **≥ 44px** minimum.
- **Avoid common “AI slop” tropes:** heavy gradient backgrounds, emoji unless on-brand, purple-on-white clichés, Inter/Roboto-only typography without reason, decorative left-border accent cards, complex hand-drawn SVG illustrations.
- **Typography:** 1–3 font families; for 1920×1080 deck-style content inside an artboard, keep type large enough to read when scaled (24px+ for body in full-slide mocks).

## Design rules for agents

1. **Stay in `designs/<name>/`** by default — do not patch the host runtime (`src/host/`, `src/lib/`, `src/preview/`, etc.) unless the human has explicitly lifted scope. See [Scope: which files to touch](#scope-which-files-to-touch).
2. **Keep artboard `id`s stable** across iterations so canvas state does not reset.
3. **Match tweak keys** across `tweaks.defaults.json`, `useDesignTweaks`, and `<Tweak*>` components.
4. **No extra dependencies** in artboards unless the user asks — canvas is self-contained React (Vite bundles modules; do not add unpinned CDN React/Babel unless the user requires it).
5. **After substantive UI changes**, run `validate` and suggest the user refresh the preview (HMR usually picks up edits).
6. **Export**: users can export PNG/HTML from artboard ⋯ menu in the canvas; agents do not need to automate this unless asked.
7. **Original work:** do not recreate distinctive third-party branded UIs unless the user owns that brand and asked for it.

## Hosted Claude Design vs Design Space

| Hosted                                  | Local Design Space                                               |
| --------------------------------------- | ---------------------------------------------------------------- |
| Single HTML file + Babel scripts        | `designs/<name>/Design.jsx` + Vite                               |
| `copy_starter_component`                | Files already in `src/lib/` and `design-canvas.jsx` at repo root |
| `/*EDITMODE-BEGIN*/` in HTML            | `tweaks.defaults.json` + `tweaks.json`                           |
| `done` / verifier agent                 | `npx design-space validate` + manual browser preview             |
| `questions_v2` refinement flow          | `design-space questions ask` (agent-triggered; not on load)      |
| Inline comments / `<mentioned-element>` | **Comment** mode → `comments.json` + `agent-feedback.md`         |
| Edit panel / `__om-edit-overrides`      | **Edit** mode → `overrides.json` (`byRef[data-ds-ref]`)          |
| `window.claude.complete` in artifacts   | Not available — use your agent tools instead                     |

## MCP and live feedback (preferred for Cursor)

- **MCP server:** `npm run mcp` — see [docs/mcp-and-hooks.md](docs/mcp-and-hooks.md) for Cursor config.
- **Project skill:** `.cursor/skills/design-space/SKILL.md`
- **New comments/edits:** append to `designs/<name>/events.jsonl`. Poll with `design-space events poll --since <iso>` or MCP `design_space_events_poll`. Do not only re-read the whole repo — use `since` from your last poll.
- **Event types:** `comment.added`, `override.updated`, `questions.answered`

## Refinement questions (agent tool)

Like hosted Claude Design’s `questions_v2`: **you** trigger the modal; it does not appear on first load.

1. Call **`design-space questions ask`** with a question set (host must be open at `design-space url`).
2. **Block until answered:** `design-space questions wait --design <name>` (polls `questions.json` every 2s; default timeout 10m). Exits `0` and prints full JSON when `status` is `"answered"`.
3. Or poll manually: `questions get` until `status === "answered"`, or read `designs/<name>/agent-feedback.md` (written on submit).
4. Continue editing with the `answers` object.

**Detection contract:** on submit the host sets `questions.json` → `{ "status": "answered", "trigger": null, "answers": { ... }, "answeredAt": "<ISO>" }` and regenerates `agent-feedback.md`. There is no push notification to the agent — use **`questions wait`** or poll **`questions get`**.

```bash
npx design-space questions ask --design demo "$(cat <<'EOF'
{
  "title": "Refinement",
  "questions": [
    { "id": "goal", "prompt": "Primary goal?", "type": "single", "options": ["Onboarding", "Settings"] },
    { "id": "notes", "prompt": "Notes", "type": "text" }
  ]
}
EOF
)"
```

- **`questions set`** — write `questions.json` without opening the UI (draft storage).
- **`questions dismiss`** — close the modal without submitting (`trigger: null`).
- On submit: `status` → `answered`, `trigger` cleared; answers in `questions.json` + `agent-feedback.md`.

Question kinds (Claude Design–aligned): `text-options` (pill chips + “Other…”), `svg-options`, `slider`, `file`, `freeform`. Legacy types still work: `single` → `text-options`, `multi` → `text-options` + `multi: true`, `text` → `freeform`. Use `title` + optional `subtitle` per question (`prompt` is accepted as alias for `title`).

## Inline comments & edit overrides

- **Comments:** Human enables **Comment**, clicks a target, saves. Use **Send to agent** for priority delivery (`agent-inbox.json` + `comment.sent` event).
- **User delete:** Feedback sidebar → **Delete** (removes from `comments.json`).
- **Agent dismiss:** `design-space comments resolve [id...]` or MCP `design_space_comments_resolve` — sets `status: "resolved"` (hidden from open feedback + pins).
- **Agent read inbox:** `design-space inbox get` or MCP `design_space_inbox_get` for direct sends.
- **Overrides:** Human uses **Edit** to change text, font size, color, weight, position mode, etc. Persisted as `overrides.json` → `{ "byRef": { "ds-3": { "styles": {...}, "textContent": "..." } } }`. The edit panel surfaces in-document colors/fonts as quick swatches.
- **Inline text:** In Edit mode, **double-click** any leaf element (or press F2 with one selected) to edit its text in-place. Enter commits; Esc reverts. Commits flow into `overrides.json` as `textContent`.
- **DOM snapshot:** The host writes `designs/<name>/dom-snapshot.txt` on Edit mode entry and after every edit — pretty-printed rendered DOM with React component names stamped. Read via MCP `design_space_dom_snapshot` to diff source JSX against what the user sees.
- **Read for coding:** `npx design-space feedback export`, `comments get`, `overrides get`.

Optional: add stable `data-ds-anchor="hero-cta"` in `Design.jsx` for clearer agent references (runtime also assigns `data-ds-ref` on pick).

## Prompts that work well

- “Scaffold a design `pricing` with three artboard variants and a tweaks panel for brand color and font size.”
- “Run `questions ask` for this design, wait for my answers, then update artboard B from `feedback export`.”
- “Read `state get` and reorder sections to match the user’s canvas.”
- “Update `designs/demo/Design.jsx` so artboard B uses the palette from `tweaks get`.”

## Codex / Claude Code setup

Add to the project’s agent context (or tell the agent explicitly):

> This repo uses Design Space. Read `AGENTS.md`. Edit designs under `designs/`. Run `npx design-space dev` to preview.

Optional **CLAUDE.md** one-liner:

```markdown
See AGENTS.md for the Design Space agent workflow (design canvas + tweaks).
```
