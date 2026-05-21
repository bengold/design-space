import React from 'react';
import { DesignCanvas, DCPage, DCSection, DCArtboard } from '../../src/lib/design-canvas.jsx';
import { useDesignTweaksDialKit } from '../../src/preview/useDesignTweaksDialKit.js';

// DialKit config — every value is a tunable control in the floating Tweaks
// panel. Folders ({...}) become collapsible groups; sliders use [def,min,max].
const TWEAK_CONFIG = {
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

// ─── Primitives ────────────────────────────────────────────────────────────

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
  const pad = densityPad[t.density];
  const gap = densityGap[t.density];
  return (
    <div
      data-ds-anchor="screen"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        padding: pad,
        background: p.surface,
        color: p.ink,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: t.fontSize,
        display: 'flex',
        flexDirection: 'column',
        gap,
        alignItems: align,
      }}
    >
      {children}
    </div>
  );
}

// ─── Onboarding · A · Welcome ──────────────────────────────────────────────

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

// ─── Onboarding · B · Connect ──────────────────────────────────────────────

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

// ─── Onboarding · C · Success ──────────────────────────────────────────────

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

// ─── Dashboard · Balance ───────────────────────────────────────────────────

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

// ─── Dashboard · Insights ──────────────────────────────────────────────────

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

// ─── Cards · Iridescent card ───────────────────────────────────────────────
// Ported from a Claude Design handoff bundle (Iridescent Card.html). Holds the
// 3D tilt + conic-rainbow + specular hotspot + SVG noise look from the
// original, scoped to one artboard. Tweak constants are inlined here instead
// of exposed in the floating Tweaks panel so the demo's existing controls stay
// uncluttered — adjust by editing this file or wiring more keys into
// TWEAK_CONFIG above if you want them live.

const CARD = {
  suit: 'spade',
  rank: 'A',
  palette: ['#ece6d6', '#0a0a0e'], // ink, paper
  tilt: 16,
  lift: 28,
  scaleH: 0.04,
  radius: 22,
  iridOpacity: 0.95,
  iridBlend: 'color-dodge',
  iridSat: 1.5,
  specSize: 38,
  specOpacity: 0.7,
  specColor: '#ffffff',
  specBlend: 'screen',
  noiseOpacity: 0.24,
  noiseScale: 0.85,
  noiseBlend: 'overlay',
  glowSize: 90,
  glowStrength: 0.55,
  glowRgb: '184 198 255',
  easing: 0.16,
};

const SUITS = {
  spade: {
    path:
      'M50 8 C 70 30, 90 45, 90 64 C 90 78, 80 86, 68 86 C 62 86, 56 83, 52 78 ' +
      'C 53 86, 56 92, 62 96 L 38 96 C 44 92, 47 86, 48 78 ' +
      'C 44 83, 38 86, 32 86 C 20 86, 10 78, 10 64 C 10 45, 30 30, 50 8 Z',
  },
  heart: {
    path:
      'M50 92 C 18 70, 6 52, 6 34 C 6 20, 18 10, 30 10 C 40 10, 47 16, 50 24 ' +
      'C 53 16, 60 10, 70 10 C 82 10, 94 20, 94 34 C 94 52, 82 70, 50 92 Z',
  },
  diamond: { path: 'M50 6 L 86 50 L 50 94 L 14 50 Z' },
  club: {
    path:
      'M50 8 A 18 18 0 1 1 49.99 8 Z M22 38 A 18 18 0 1 1 21.99 38 Z ' +
      'M78 38 A 18 18 0 1 1 77.99 38 Z M44 56 C 44 70, 38 80, 30 92 L 70 92 C 62 80, 56 70, 56 56 Z',
  },
};

function NoiseSvgUrl({ baseFreq }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFreq}' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.2 -0.2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='1'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function CardArt({ ink, paper }) {
  const glyph = SUITS[CARD.suit];
  return (
    <svg viewBox="0 0 500 700" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <pattern
          id="card-hatch"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke={ink} strokeOpacity="0.18" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="500" height="700" fill={paper} />
      <g fill="none" stroke={ink} strokeOpacity="0.5">
        <rect x="22" y="22" width="456" height="656" rx="14" strokeWidth="1" />
        <rect
          x="30"
          y="30"
          width="440"
          height="640"
          rx="10"
          strokeWidth="0.5"
          strokeOpacity="0.35"
        />
      </g>
      {[
        { tx: 56, ty: 60, rot: 0 },
        { tx: 444, ty: 640, rot: 180 },
      ].map(({ tx, ty, rot }, i) => (
        <g key={i} transform={`translate(${tx} ${ty}) rotate(${rot})`} fill={ink}>
          <text
            x="0"
            y="0"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="52"
            fontWeight="500"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {CARD.rank}
          </text>
          <g transform="translate(-24 38) scale(0.36)">
            <path d={glyph.path} fill={ink} />
          </g>
        </g>
      ))}
      <g transform="translate(250 350)">
        <circle r="160" fill="none" stroke={ink} strokeOpacity="0.18" strokeWidth="1" />
        <circle r="138" fill="none" stroke={ink} strokeOpacity="0.32" strokeWidth="0.6" />
        <circle r="118" fill="url(#card-hatch)" opacity="0.55" />
        <circle r="118" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="0.5" />
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 16;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 138}
              y1={Math.sin(a) * 138}
              x2={Math.cos(a) * 148}
              y2={Math.sin(a) * 148}
              stroke={ink}
              strokeOpacity="0.28"
              strokeWidth="0.6"
            />
          );
        })}
        <g transform="translate(-95 -95) scale(1.9)">
          <path d={glyph.path} fill={ink} />
        </g>
      </g>
      <g stroke={ink} strokeOpacity="0.4" strokeWidth="0.5">
        <line x1="190" y1="116" x2="310" y2="116" />
        <line x1="190" y1="584" x2="310" y2="584" />
      </g>
      <text
        x="250"
        y="138"
        fill={ink}
        fillOpacity="0.55"
        fontFamily="Georgia, serif"
        fontStyle="italic"
        fontSize="11"
        letterSpacing="2"
        textAnchor="middle"
      >
        — HOLOGRAPHIC EDITION —
      </text>
    </svg>
  );
}

function IridescentCardScreen() {
  const cardRef = React.useRef(null);
  const stateRef = React.useRef({
    tx: 0,
    ty: 0,
    hv: 0,
    cx: 0,
    cy: 0,
    ch: 0,
    mx: 0.5,
    my: 0.5,
    cmx: 0.5,
    cmy: 0.5,
  });

  React.useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      stateRef.current.mx = Math.max(0, Math.min(1, x));
      stateRef.current.my = Math.max(0, Math.min(1, y));
      stateRef.current.tx = (stateRef.current.mx - 0.5) * 2;
      stateRef.current.ty = (stateRef.current.my - 0.5) * 2;
      stateRef.current.hv = 1;
    };
    const onLeave = () => {
      stateRef.current.hv = 0;
      stateRef.current.tx = 0;
      stateRef.current.ty = 0;
      stateRef.current.mx = 0.5;
      stateRef.current.my = 0.5;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerenter', () => (stateRef.current.hv = 1));
    el.addEventListener('pointerleave', onLeave);

    let raf;
    const tick = () => {
      const s = stateRef.current;
      const k = CARD.easing;
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;
      s.ch += (s.hv - s.ch) * k;
      s.cmx += (s.mx - s.cmx) * (k * 1.6);
      s.cmy += (s.my - s.cmy) * (k * 1.6);
      el.style.setProperty('--px', s.cx.toFixed(4));
      el.style.setProperty('--py', s.cy.toFixed(4));
      el.style.setProperty('--mx', s.cmx.toFixed(4));
      el.style.setProperty('--my', s.cmy.toFixed(4));
      el.style.setProperty('--hover', s.ch.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const [ink, paper] = CARD.palette;
  const noiseUrl = React.useMemo(() => NoiseSvgUrl({ baseFreq: CARD.noiseScale }), []);

  return (
    <div
      data-ds-anchor="iridescent-stage"
      style={{
        position: 'relative',
        height: '100%',
        background: 'radial-gradient(120% 90% at 50% 45%, #16161d 0%, #0a0a0e 45%, #04040a 100%)',
        display: 'grid',
        placeItems: 'center',
        perspective: 1400,
        color: '#cfcfd6',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        data-ds-anchor="legend"
        style={{
          position: 'absolute',
          left: 28,
          top: 26,
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(220, 220, 235, 0.42)',
        }}
      >
        Holographic Print
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            color: 'rgba(220, 220, 235, 0.28)',
            marginTop: 6,
          }}
        >
          Single Card · Hover & Move
        </div>
      </div>

      <div
        style={{
          width: 'min(280px, 70%)',
          aspectRatio: '5 / 7',
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          ref={cardRef}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: CARD.radius,
            background: paper,
            color: ink,
            transformStyle: 'preserve-3d',
            transform: `translateZ(calc(${CARD.lift}px * var(--hover, 0))) scale(calc(1 + (${CARD.scaleH} * var(--hover, 0)))) rotateX(calc(var(--py, 0) * ${CARD.tilt}deg * -1)) rotateY(calc(var(--px, 0) * ${CARD.tilt}deg))`,
            transition:
              'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 calc(28px + 30px * var(--hover, 0)) calc(50px + 40px * var(--hover, 0)) rgba(0,0,0,0.55), inset 0 0 0 0.5px rgba(255,255,255,0.06), 0 0 calc(${CARD.glowSize}px * var(--hover, 0)) rgba(${CARD.glowRgb}, calc(${CARD.glowStrength} * var(--hover, 0)))`,
            willChange: 'transform',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            <CardArt ink={ink} paper={paper} />
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 2,
              opacity: CARD.iridOpacity,
              mixBlendMode: CARD.iridBlend,
              filter: `saturate(${CARD.iridSat})`,
              background:
                'conic-gradient(from calc((var(--px, 0) * 220deg) + (var(--py, 0) * 90deg)), oklch(78% 0.20 30), oklch(82% 0.18 80), oklch(86% 0.22 140), oklch(80% 0.20 200), oklch(70% 0.24 270), oklch(76% 0.22 330), oklch(78% 0.20 30))',
              backgroundBlendMode: 'screen',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 3,
              mixBlendMode: CARD.specBlend,
              opacity: `calc(${CARD.specOpacity} * var(--hover, 0))`,
              background: `radial-gradient(circle at calc(var(--mx, 0.5) * 100%) calc(var(--my, 0.5) * 100%), ${CARD.specColor} 0%, rgba(255,255,255,0) ${CARD.specSize}%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 4,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 5,
              opacity: CARD.noiseOpacity,
              mixBlendMode: CARD.noiseBlend,
              backgroundImage: noiseUrl,
              backgroundSize: '220px 220px',
            }}
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 26,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'rgba(220, 220, 235, 0.32)',
          pointerEvents: 'none',
        }}
      >
        Hover the card · Move the cursor
      </div>
    </div>
  );
}

// ─── Wiring ────────────────────────────────────────────────────────────────

export default function Design({ designName = 'demo' }) {
  const t = useDesignTweaksDialKit(designName, TWEAK_CONFIG);
  let p = PALETTES[t.paletteName] ?? PALETTES.warm;
  if (t.dark) {
    p = { surface: '#1c1a16', ink: '#f6f4ef', muted: '#8a8076', tint: '#2a2620' };
  }

  return (
    <DesignCanvas>
      <DCPage id="onboarding" title="Onboarding">
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
      </DCPage>
      <DCPage id="dashboard" title="Dashboard">
        <DCSection
          id="dashboard-views"
          title="Dashboard"
          subtitle="Where the money is, where it went"
        >
          <DCArtboard id="balance" label="Balance" width={402} height={874}>
            <BalanceScreen t={t} p={p} />
          </DCArtboard>
          <DCArtboard id="insights" label="Insights" width={402} height={874}>
            <InsightsScreen t={t} p={p} />
          </DCArtboard>
        </DCSection>
      </DCPage>
      <DCPage id="cards" title="Cards">
        <DCSection id="cards-showcase" title="Cards" subtitle="Holographic print · hover the card">
          <DCArtboard id="iridescent" label="Iridescent" width={560} height={780}>
            <IridescentCardScreen />
          </DCArtboard>
        </DCSection>
      </DCPage>
    </DesignCanvas>
  );
}
