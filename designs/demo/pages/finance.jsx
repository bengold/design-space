import React from 'react';
import { DCSection, DCArtboard } from '../../../src/lib/design-canvas.jsx';
import { useDesignTweaksDialKit } from '../../../src/preview/useDesignTweaksDialKit.js';

// Tweaks live with the page that consumes them — when the page is active the
// hook registers these controls; switching pages unmounts the hook and the
// panel swaps to the new page's set. Values still merge in tweaks.json so
// nothing is lost between switches.
const APP_TWEAKS = {
  fontSize: [15, 12, 22],
  density: { type: 'select', options: ['compact', 'regular', 'comfy'], default: 'regular' },
  paletteName: {
    type: 'select',
    options: [
      { value: 'warm', label: 'Warm' },
      { value: 'slate', label: 'Slate' },
      { value: 'forest', label: 'Forest' },
    ],
    default: 'warm',
  },
  primaryColor: { type: 'color', default: '#D97757' },
  dark: false,
};

const PALETTES = {
  warm: { surface: '#fbf8f3', ink: '#2a251f', muted: '#9a8c7c', tint: '#f4ede0' },
  slate: { surface: '#f8fafc', ink: '#0f172a', muted: '#64748b', tint: '#e2e8f0' },
  forest: { surface: '#f4f8f3', ink: '#1a2e1f', muted: '#6b8475', tint: '#d8e4d4' },
};

const densityPad = { compact: 14, regular: 20, comfy: 28 };
const densityGap = { compact: 8, regular: 12, comfy: 16 };

function resolvePalette(t) {
  if (t.dark) return { surface: '#1c1a16', ink: '#f6f4ef', muted: '#8a8076', tint: '#2a2620' };
  return PALETTES[t.paletteName] ?? PALETTES.warm;
}

function Button({ t, p, children, variant = 'primary', full = false }) {
  const styles = {
    primary: { background: t.primaryColor, color: '#fff', border: 0 },
    secondary: { background: 'transparent', color: p.ink, border: `1px solid ${p.tint}` },
    ghost: { background: 'transparent', color: p.muted, border: 0 },
  }[variant];
  return (
    <button
      type="button"
      style={{
        ...styles,
        padding: '10px 14px',
        borderRadius: 8,
        fontWeight: 600,
        fontSize: t.fontSize - 1,
        cursor: 'default',
        width: full ? '100%' : 'auto',
      }}
    >
      {children}
    </button>
  );
}

function ScreenFrame({ t, p, children, align = 'stretch' }) {
  return (
    <div
      data-ds-anchor="screen"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        padding: densityPad[t.density],
        background: p.surface,
        color: p.ink,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: t.fontSize,
        display: 'flex',
        flexDirection: 'column',
        gap: densityGap[t.density],
        alignItems: align,
      }}
    >
      {children}
    </div>
  );
}

function WelcomeScreen({ t, p }) {
  return (
    <ScreenFrame t={t} p={p}>
      <div
        data-ds-anchor="brand-mark"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: t.primaryColor,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 20,
        }}
      >
        ✱
      </div>
      <div
        data-ds-anchor="headline"
        style={{ fontWeight: 700, fontSize: t.fontSize + 10, lineHeight: 1.2 }}
      >
        Money you can <span style={{ color: t.primaryColor, fontStyle: 'italic' }}>actually</span>{' '}
        read.
      </div>
      <p style={{ margin: 0, color: p.muted, lineHeight: 1.5 }}>
        Connect an account in 30 seconds. We never sell your data.
      </p>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button t={t} p={p} full>
          Get started
        </Button>
        <Button t={t} p={p} variant="ghost" full>
          I already have an account
        </Button>
      </div>
    </ScreenFrame>
  );
}

function ConnectScreen({ t, p }) {
  const banks = ['Chase', 'Wells Fargo', 'Bank of America', 'Capital One', 'Schwab'];
  return (
    <ScreenFrame t={t} p={p}>
      <div
        data-ds-anchor="step-label"
        style={{
          fontSize: t.fontSize - 3,
          color: p.muted,
          fontWeight: 600,
          letterSpacing: '0.08em',
        }}
      >
        STEP 2 OF 3
      </div>
      <div
        data-ds-anchor="headline"
        style={{ fontWeight: 700, fontSize: t.fontSize + 6, lineHeight: 1.2 }}
      >
        Connect your bank
      </div>
      <input
        readOnly
        value="Search 12,000+ institutions"
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${p.tint}`,
          background: '#fff',
          color: p.muted,
          fontSize: t.fontSize - 1,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {banks.map((name, i) => (
          <li
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: i === 0 ? p.tint : 'transparent',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: p.ink,
                color: p.surface,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {name[0]}
            </span>
            <span style={{ fontSize: t.fontSize - 1, fontWeight: 500 }}>{name}</span>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}

function SuccessScreen({ t, p }) {
  return (
    <ScreenFrame t={t} p={p} align="center">
      <div style={{ marginTop: 'auto' }} />
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: t.primaryColor,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontSize: 30,
        }}
      >
        ✓
      </div>
      <div
        data-ds-anchor="headline"
        style={{ fontWeight: 700, fontSize: t.fontSize + 8, textAlign: 'center' }}
      >
        You're all set
      </div>
      <p style={{ margin: 0, textAlign: 'center', color: p.muted, lineHeight: 1.5, maxWidth: 280 }}>
        Your accounts will refresh every morning.
      </p>
      <div style={{ marginTop: 'auto', width: '100%' }}>
        <Button t={t} p={p} full>
          Open dashboard
        </Button>
      </div>
    </ScreenFrame>
  );
}

function BalanceScreen({ t, p }) {
  const accounts = [
    { name: 'Everyday checking', value: '$4,287.10', delta: '+$320' },
    { name: 'High-yield savings', value: '$18,940.32', delta: '+$112' },
    { name: 'Travel rewards', value: '−$842.55', delta: '−$56' },
  ];
  return (
    <ScreenFrame t={t} p={p}>
      <div
        data-ds-anchor="page-title"
        style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <div style={{ fontWeight: 700, fontSize: t.fontSize + 4 }}>Good morning, Ben</div>
        <div style={{ fontSize: t.fontSize - 3, color: p.muted }}>Tue Nov 14</div>
      </div>
      <div
        data-ds-anchor="hero-balance"
        style={{
          padding: densityPad[t.density],
          background: t.primaryColor,
          color: '#fff',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: t.fontSize - 3,
            opacity: 0.85,
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          NET WORTH
        </div>
        <div
          style={{ fontSize: t.fontSize + 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        >
          $22,384.87
        </div>
        <div style={{ fontSize: t.fontSize - 2, opacity: 0.85 }}>+$376 this week</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {accounts.map((a) => (
          <div
            key={a.name}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              padding: '10px 4px',
              borderBottom: `1px solid ${p.tint}`,
            }}
          >
            <div>
              <div style={{ fontSize: t.fontSize - 1, fontWeight: 500 }}>{a.name}</div>
              <div style={{ fontSize: t.fontSize - 4, color: p.muted }}>{a.delta} this week</div>
            </div>
            <div
              style={{
                fontSize: t.fontSize - 1,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {a.value}
            </div>
          </div>
        ))}
      </div>
    </ScreenFrame>
  );
}

function InsightsScreen({ t, p }) {
  const categories = [
    { label: 'Groceries', amount: 412, pct: 0.82 },
    { label: 'Rent', amount: 1800, pct: 1 },
    { label: 'Transit', amount: 88, pct: 0.18 },
    { label: 'Eating out', amount: 246, pct: 0.55 },
    { label: 'Subscriptions', amount: 64, pct: 0.13 },
  ];
  return (
    <ScreenFrame t={t} p={p}>
      <div data-ds-anchor="page-title" style={{ fontWeight: 700, fontSize: t.fontSize + 4 }}>
        Where it went · November
      </div>
      <div style={{ fontSize: t.fontSize - 2, color: p.muted, marginTop: -4 }}>
        $2,610 spent across 5 categories
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
        {categories.map((c) => (
          <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: t.fontSize - 2 }}
            >
              <span>{c.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: p.muted }}>
                ${c.amount}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: p.tint, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${c.pct * 100}%`,
                  height: '100%',
                  background: t.primaryColor,
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <Button t={t} p={p} variant="secondary" full>
          Export CSV
        </Button>
        <Button t={t} p={p} full>
          See details
        </Button>
      </div>
    </ScreenFrame>
  );
}

// ─── Page exports ─────────────────────────────────────────────────────────────
// Each page registers its own tweaks via useDesignTweaksDialKit. When the page
// unmounts (user switches away), the hook tears down — the next active page's
// tweaks fill the panel.

export function OnboardingPage({ designName }) {
  const t = useDesignTweaksDialKit(designName, APP_TWEAKS);
  const p = resolvePalette(t);
  return (
    <DCSection id="onboarding-flow" title="Onboarding" subtitle="Welcome → Connect → Success">
      <DCArtboard id="a" label="A · Welcome" width={402} height={874}>
        <WelcomeScreen t={t} p={p} />
      </DCArtboard>
      <DCArtboard id="b" label="B · Connect" width={402} height={874}>
        <ConnectScreen t={t} p={p} />
      </DCArtboard>
      <DCArtboard id="c" label="C · Success" width={402} height={874}>
        <SuccessScreen t={t} p={p} />
      </DCArtboard>
    </DCSection>
  );
}

export function DashboardPage({ designName }) {
  const t = useDesignTweaksDialKit(designName, APP_TWEAKS);
  const p = resolvePalette(t);
  return (
    <DCSection id="dashboard-views" title="Dashboard" subtitle="Where the money is, where it went">
      <DCArtboard id="balance" label="Balance" width={402} height={874}>
        <BalanceScreen t={t} p={p} />
      </DCArtboard>
      <DCArtboard id="insights" label="Insights" width={402} height={874}>
        <InsightsScreen t={t} p={p} />
      </DCArtboard>
    </DCSection>
  );
}
