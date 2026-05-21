import React from 'react';
import { DesignCanvas, DCSection, DCArtboard } from '../../src/lib/design-canvas.jsx';
import { useDesignTweaksDialKit } from '../../src/preview/useDesignTweaksDialKit.js';

// DialKit config schema for this design.
//
// Top-level keys with object values become collapsible folders in the panel
// — they're a great way to group related controls without giving up the
// flat reading shape downstream (`t.Typography.fontSize`). For the demo we
// keep a couple of controls at the root and a few in a folder.
//
// Control shapes (see src/preview/useDesignTweaksDialKit.js for the full
// list):
//   slider with range  →  [default, min, max]   (or `[default, min, max, step]`)
//   slider w/o range   →  number literal
//   toggle             →  boolean literal
//   select             →  { type: 'select', options, default }
//   color              →  { type: 'color', default }
//   text               →  { type: 'text',  default }
const TWEAK_CONFIG = {
  // Typography
  fontSize: [16, 12, 24],
  density: { type: 'select', options: ['compact', 'regular', 'comfy'], default: 'regular' },
  // Theme
  primaryColor: {
    type: 'select',
    options: [
      { value: '#D97757', label: 'Warm' },
      { value: '#2A6FDB', label: 'Cobalt' },
      { value: '#1F8A5B', label: 'Forest' },
      { value: '#7A5AE0', label: 'Violet' },
    ],
    default: '#D97757',
  },
  paletteName: {
    type: 'select',
    options: [
      { value: 'warm', label: 'Warm' },
      { value: 'slate', label: 'Slate' },
    ],
    default: 'warm',
  },
  dark: false,
};

const PALETTES = {
  warm: ['#D97757', '#29261b', '#f6f4ef'],
  slate: ['#475569', '#0f172a', '#f1f5f9'],
};

const densityPad = { compact: 12, regular: 20, comfy: 28 };

function OnboardingCard({ t, palette }) {
  const pad = densityPad[t.density] ?? 20;
  return (
    <div
      style={{
        height: '100%',
        padding: pad,
        boxSizing: 'border-box',
        background: t.dark ? '#1a1814' : palette[2],
        color: t.dark ? '#f6f4ef' : palette[1],
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: t.fontSize,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: t.primaryColor }} />
      <div style={{ fontWeight: 600, fontSize: t.fontSize + 4 }}>Welcome back</div>
      <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.45 }}>
        Pick up where you left off, or start a new layout on the canvas.
      </p>
      <button
        type="button"
        style={{
          marginTop: 'auto',
          alignSelf: 'flex-start',
          padding: '10px 16px',
          border: 0,
          borderRadius: 8,
          background: t.primaryColor,
          color: '#fff',
          fontWeight: 600,
          fontSize: t.fontSize - 1,
          cursor: 'default',
        }}
      >
        Continue
      </button>
    </div>
  );
}

function MinimalCard({ t, palette }) {
  const pad = densityPad[t.density] ?? 20;
  return (
    <div
      style={{
        height: '100%',
        padding: pad,
        boxSizing: 'border-box',
        background: '#fff',
        color: palette[1],
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: t.fontSize,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 8,
      }}
    >
      <div style={{ fontSize: t.fontSize + 10, fontWeight: 400, color: t.primaryColor }}>
        Design Space
      </div>
      <div style={{ opacity: 0.55 }}>Agent-editable design preview</div>
    </div>
  );
}

export default function Design({ designName = 'demo' }) {
  const t = useDesignTweaksDialKit(designName, TWEAK_CONFIG);
  const palette = PALETTES[t.paletteName] ?? PALETTES.warm;

  return (
    <DesignCanvas>
      <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
        <DCArtboard id="a" label="A · Warm" width={260} height={480}>
          <OnboardingCard t={t} palette={palette} />
        </DCArtboard>
        <DCArtboard id="b" label="B · Minimal" width={260} height={480}>
          <MinimalCard t={t} palette={palette} />
        </DCArtboard>
      </DCSection>
      <DCSection id="settings" title="Settings" subtitle="Density and theme">
        <DCArtboard id="prefs" label="Preferences" width={300} height={420}>
          <OnboardingCard t={t} palette={palette} />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
