import React from 'react';

// ⚠️  Deprecated — the shadcn-based <TweaksPanel> + <Tweak*> components have
// been replaced by DialKit. This file remains only as a back-compat shim so
// designs authored against the old API keep loading (rendering nothing) until
// they're migrated.
//
// Migration path (designs/<name>/Design.jsx):
//
//   // before
//   import {
//     TweaksPanel, TweakSection, TweakSlider, TweakColor, TweakRadio, TweakToggle,
//   } from '../../src/lib/tweaks-panel.jsx';
//   import { useDesignTweaks } from '../../src/preview/useDesignTweaks.js';
//
//   const [t, setTweak] = useDesignTweaks('demo', { fontSize: 16, dark: false });
//   return (
//     <>
//       …
//       <TweaksPanel>
//         <TweakSlider label="Font size" value={t.fontSize} min={12} max={24}
//                      onChange={(v) => setTweak('fontSize', v)} />
//         <TweakToggle label="Dark" value={t.dark}
//                      onChange={(v) => setTweak('dark', v)} />
//       </TweaksPanel>
//     </>
//   );
//
//   // after
//   import { useDesignTweaksDialKit } from '../../src/preview/useDesignTweaksDialKit.js';
//
//   const t = useDesignTweaksDialKit('demo', {
//     Typography: { fontSize: [16, 12, 24] },
//     Theme:      { dark: false },
//   });
//   return <>…</>; // no panel JSX — DialKit's <DialRoot> is mounted in main.jsx
//
// See src/preview/useDesignTweaksDialKit.js for the full config shape
// (sliders, colors, selects, toggles, folders).

let warned = false;
function warnOnce(name) {
  if (warned) return;
  warned = true;
  if (typeof console !== 'undefined') {
    console.warn(
      `[design-space] ${name} from src/lib/tweaks-panel.jsx is deprecated. ` +
        `Migrate to useDesignTweaksDialKit (see src/preview/useDesignTweaksDialKit.js). ` +
        `The legacy component is now a no-op.`,
    );
  }
}

// useTweaks: returns the defaults verbatim and a setter that emits the same
// __edit_mode_set_keys / tweakchange events the old hook did. This keeps the
// host's persistence path working for designs that haven't migrated yet —
// they just won't have a visible panel until they switch to DialKit.
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  React.useEffect(() => warnOnce('useTweaks'), []);
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits =
      typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
    }
  }, []);
  return [values, setTweak];
}

// Render-time shims: log once, then render nothing. They don't error so a
// stale design still mounts (canvas + artboards render normally) — the panel
// just doesn't appear.
const noopFactory = (name) =>
  function Deprecated() {
    React.useEffect(() => warnOnce(name), []);
    return null;
  };

const TweaksPanel = noopFactory('TweaksPanel');
const TweakSection = noopFactory('TweakSection');
const TweakRow = noopFactory('TweakRow');
const TweakSlider = noopFactory('TweakSlider');
const TweakToggle = noopFactory('TweakToggle');
const TweakRadio = noopFactory('TweakRadio');
const TweakSelect = noopFactory('TweakSelect');
const TweakText = noopFactory('TweakText');
const TweakNumber = noopFactory('TweakNumber');
const TweakColor = noopFactory('TweakColor');
const TweakButton = noopFactory('TweakButton');

export {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton,
};
