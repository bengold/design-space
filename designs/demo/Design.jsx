import React from 'react';
import { DesignCanvas, DCSection, DCArtboard, DCPostIt } from '../../src/lib/design-canvas.jsx';
import {
  TweaksPanel,
  TweakSection,
  TweakSlider,
  TweakRadio,
  TweakColor,
  TweakToggle,
} from '../../src/lib/tweaks-panel.jsx';
import { useDesignTweaks } from '../../src/preview/useDesignTweaks.js';

const FALLBACK_DEFAULTS = {
  primaryColor: '#D97757',
  palette: ['#D97757', '#29261b', '#f6f4ef'],
  fontSize: 16,
  density: 'regular',
  dark: false,
};

const densityPad = { compact: 12, regular: 20, comfy: 28 };

function OnboardingCard({ t }) {
  const pad = densityPad[t.density] ?? 20;
  return (
    <div
      style={{
        height: '100%',
        padding: pad,
        boxSizing: 'border-box',
        background: t.dark ? '#1a1814' : t.palette[2],
        color: t.dark ? '#f6f4ef' : t.palette[1],
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

function MinimalCard({ t }) {
  const pad = densityPad[t.density] ?? 20;
  return (
    <div
      style={{
        height: '100%',
        padding: pad,
        boxSizing: 'border-box',
        background: '#fff',
        color: t.palette[1],
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
  const [t, setTweak] = useDesignTweaks(designName, FALLBACK_DEFAULTS);

  return (
    <>
      <DesignCanvas>
        <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
          <DCArtboard id="a" label="A · Warm" width={260} height={480}>
            <OnboardingCard t={t} />
          </DCArtboard>
          <DCArtboard id="b" label="B · Minimal" width={260} height={480}>
            <MinimalCard t={t} />
          </DCArtboard>
        </DCSection>
        <DCSection id="settings" title="Settings" subtitle="Density and theme">
          <DCArtboard id="prefs" label="Preferences" width={300} height={420}>
            <OnboardingCard t={t} />
          </DCArtboard>
          <DCPostIt top={-20} right={-40}>
            Drag artboards · Focus with expand · Open Tweaks in the host toolbar
          </DCPostIt>
        </DCSection>
      </DesignCanvas>
      <TweaksPanel>
        <TweakSection label="Typography" />
        <TweakSlider
          label="Font size"
          value={t.fontSize}
          min={12}
          max={24}
          unit="px"
          onChange={(v) => setTweak('fontSize', v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakSection label="Theme" />
        <TweakColor
          label="Primary"
          value={t.primaryColor}
          options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
          onChange={(v) => setTweak('primaryColor', v)}
        />
        <TweakColor
          label="Palette"
          value={t.palette}
          options={[
            ['#D97757', '#29261b', '#f6f4ef'],
            ['#475569', '#0f172a', '#f1f5f9'],
          ]}
          onChange={(v) => setTweak('palette', v)}
        />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak('dark', v)} />
      </TweaksPanel>
    </>
  );
}
