import React from 'react';
import { useDialKit } from 'dialkit';
import { loadTweakValues, loadTweaksFromLocalStorage, persistTweakEdits } from './tweakStorage.js';

// ── seedConfig ──────────────────────────────────────────────────────────────
// Walks the user-authored DialKit config and rewrites the default of any leaf
// control whose path is present in `seed`. This is how persisted values
// (tweaks.defaults.json + tweaks.json + localStorage) override the in-source
// defaults — DialKit only reads defaults from the config, so the seed has to
// be folded in before useDialKit sees the object.
//
// Leaf shapes (mirroring DialKit's internal type guards):
//   number              → slider with no range  (e.g. `scale: 1.2`)
//   [n, min, max]       → slider with range     (e.g. `blur: [24, 0, 100]`)
//   [n, min, max, step] → slider with step
//   string              → text (when not hex) OR color (when hex)
//   boolean             → toggle
//   { type: 'color', default }   → color picker
//   { type: 'text',  default }   → text input
//   { type: 'select', default, options } → select
//   { type: 'spring' | 'easing' | 'transition' | 'action' } → not seeded
//   plain object        → nested folder (recurse)
//
// We do not synthesize new controls — only override the default of existing
// ones. If the seed contains a key the design didn't declare, it's silently
// ignored (it'll keep being merged at persistence time via tweakStorage, just
// never surfaces in the panel UI).
function seedConfig(config, seed) {
  if (!seed || typeof seed !== 'object') return config;
  const out = Array.isArray(config) ? config.slice() : { ...config };

  for (const [key, raw] of Object.entries(config)) {
    if (!(key in seed)) {
      // For nested folders, still recurse — seed might target inner keys.
      if (isFolder(raw)) out[key] = seedConfig(raw, undefined);
      continue;
    }
    const next = seed[key];

    if (isSliderTuple(raw)) {
      // Replace the first slot (default) only; keep min/max/step.
      const [, ...rest] = raw;
      out[key] = [Number(next), ...rest];
    } else if (typeof raw === 'number') {
      out[key] = Number(next);
    } else if (typeof raw === 'boolean') {
      out[key] = Boolean(next);
    } else if (typeof raw === 'string') {
      out[key] = String(next);
    } else if (isTaggedConfig(raw)) {
      // { type: 'color' | 'text' | 'select' | ... } — only `default` is
      // overridable. The other shapes (spring/easing/transition/action)
      // don't expose a `default` we'd persist.
      const t = raw.type;
      if (t === 'color' || t === 'text' || t === 'select') {
        out[key] = { ...raw, default: next };
      }
    } else if (isFolder(raw)) {
      // Nested folder — recurse with the matching slice of seed (if it's an
      // object; otherwise we skip — the user passed a primitive where the
      // schema declares a folder, which is a config mismatch).
      out[key] = seedConfig(raw, typeof next === 'object' && next !== null ? next : undefined);
    }
  }
  return out;
}

function isSliderTuple(v) {
  return Array.isArray(v) && v.length > 0 && v.length <= 4 && typeof v[0] === 'number';
}

function isTaggedConfig(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.type === 'string';
}

function isFolder(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v.type !== 'string';
}

// ── flatten ────────────────────────────────────────────────────────────────
// useDesignTweaks promised a flat record (e.g. `t.fontSize`, `t.dark`) and
// persistence is also keyed flat (tweaks.json shape). DialKit naturally
// returns nested objects for folder configs — when designs use folders we'd
// lose flatness. We resolve this by flattening the top level only: nested
// folder values still come through as objects under their folder key, which
// preserves the DialKit author's intent. Designs that want flat keys simply
// don't nest.
function shallowDiff(prev, next) {
  if (!prev) return { ...next };
  const out = {};
  for (const k of Object.keys(next)) {
    if (!Object.is(prev[k], next[k])) out[k] = next[k];
  }
  return out;
}

// ── useDesignTweaksDialKit ─────────────────────────────────────────────────
// Drop-in replacement for the old useDesignTweaks: takes a DialKit config
// object instead of a flat defaults record. Returns the resolved values from
// DialKit (reactive) and on each change pushes a diff to the host via the
// existing __edit_mode_set_keys postMessage protocol, then persists locally.
//
// Usage:
//   const t = useDesignTweaksDialKit('demo', {
//     fontSize: [16, 12, 24],
//     density: { type: 'select', options: ['compact', 'regular', 'comfy'], default: 'regular' },
//     primaryColor: { type: 'color', default: '#D97757' },
//     dark: false,
//   });
//
// `t.fontSize`, `t.density`, etc. update live as the user moves the dials.
//
// The panel itself (the floating UI) is rendered by <DesignTweaksRoot>
// mounted once at app root — see src/preview/DesignTweaksRoot.jsx. That
// component gates DialRoot's mount on the host's __activate_edit_mode
// signal so the panel only appears when the toolbar's Tweaks toggle is on.
export function useDesignTweaksDialKit(designName, baseConfig, options) {
  // Seed pass 1: synchronous — read fallback defaults out of the config so
  // the first render has reasonable values. We don't have disk values yet.
  const [seed, setSeed] = React.useState(undefined);
  const [ready, setReady] = React.useState(false);

  // Resolve flat fallback defaults from the config (for fetchJson's fallback
  // argument). DialKit will use the config's own defaults on first render
  // even if seed is undefined, so this is just for the disk-fetch fallback.
  const fallbackDefaults = React.useMemo(() => extractDefaults(baseConfig), [baseConfig]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromDisk = await loadTweakValues(designName, fallbackDefaults);
      const withLocal = loadTweaksFromLocalStorage(designName, fromDisk);
      if (!cancelled) {
        setSeed(withLocal);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [designName, fallbackDefaults]);

  const seededConfig = React.useMemo(
    () => (seed ? seedConfig(baseConfig, seed) : baseConfig),
    [baseConfig, seed],
  );

  const values = useDialKit(options?.panelName || 'Tweaks', seededConfig, options);

  // Push every change to the host + local persistence. We skip the very
  // first render after the seed lands so we don't echo the seed back into
  // tweaks.json as an "edit".
  const prevRef = React.useRef(null);
  const sentSeedRef = React.useRef(false);
  React.useEffect(() => {
    if (!ready) return;
    if (!sentSeedRef.current) {
      sentSeedRef.current = true;
      prevRef.current = values;
      return;
    }
    const edits = shallowDiff(prevRef.current, values);
    if (Object.keys(edits).length === 0) return;
    prevRef.current = values;
    // Host: rewrites tweaks.json on disk.
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    }
    // Same-window: peers (deck-stage etc.) listen for this CustomEvent.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
    }
    // Local fallback persistence (mirrors the host's writeFile path in case
    // the host isn't listening — e.g. standalone preview).
    persistTweakEdits(designName, edits);
  }, [values, ready, designName]);

  return values;
}

// Extract a flat record of leaf defaults from a DialKit config — used to
// seed loadTweakValues' fallback argument before disk values arrive.
function extractDefaults(config) {
  const out = {};
  for (const [key, raw] of Object.entries(config)) {
    if (isSliderTuple(raw)) out[key] = raw[0];
    else if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string')
      out[key] = raw;
    else if (isTaggedConfig(raw)) {
      if (raw.type === 'color') out[key] = raw.default ?? '#000000';
      else if (raw.type === 'text') out[key] = raw.default ?? '';
      else if (raw.type === 'select')
        out[key] =
          raw.default ??
          (typeof raw.options?.[0] === 'string' ? raw.options[0] : raw.options?.[0]?.value);
    } else if (isFolder(raw)) {
      out[key] = extractDefaults(raw);
    }
  }
  return out;
}
