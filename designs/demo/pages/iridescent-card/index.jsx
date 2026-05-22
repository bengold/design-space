import React from 'react';
import { useDesignTweaks } from '../../../../src/lib/tweaks-panel.jsx';

// Tweaks specific to this page. Mounted only while the Cards page is active.
const CARD_TWEAKS = {
  suit: {
    type: 'select',
    options: [
      { value: 'spade', label: '♠ Spade' },
      { value: 'heart', label: '♥ Heart' },
      { value: 'diamond', label: '♦ Diamond' },
      { value: 'club', label: '♣ Club' },
    ],
    default: 'spade',
  },
  rank: { type: 'select', options: ['A', 'K', 'Q', 'J', '10'], default: 'A' },
  paletteName: {
    type: 'select',
    options: [
      { value: 'bone', label: 'Bone on obsidian' },
      { value: 'ice', label: 'Ice on midnight' },
      { value: 'gold', label: 'Gold on coffee' },
      { value: 'ink', label: 'Ink on bone' },
      { value: 'silver', label: 'Silver on graphite' },
      { value: 'amethyst', label: 'Amethyst' },
    ],
    default: 'bone',
  },
  radius: [22, 0, 48, 1],
  tilt: [16, 0, 40, 1],
  iridOpacity: [0.95, 0, 1.2, 0.02],
  iridSat: [1.5, 0, 3, 0.05],
  iridBlend: {
    type: 'select',
    options: ['color-dodge', 'screen', 'overlay', 'hard-light', 'soft-light', 'lighten'],
    default: 'color-dodge',
  },
  specOpacity: [0.7, 0, 1.5, 0.02],
  specSize: [38, 5, 90, 1],
  noiseOpacity: [0.24, 0, 1, 0.02],
  noiseScale: [0.85, 0.2, 2.5, 0.05],
  glowSize: [90, 0, 220, 1],
  glowStrength: [0.55, 0, 1.5, 0.02],
};

const PALETTES = {
  bone: ['#ece6d6', '#0a0a0e'],
  ice: ['#cbd6e8', '#0b1224'],
  gold: ['#e9d8a6', '#1a120a'],
  ink: ['#0c0c10', '#f4efe6'],
  silver: ['#d0d0d4', '#141416'],
  amethyst: ['#e8c4ff', '#160b22'],
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

function makeNoiseUrl(baseFreq) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFreq}' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.2 -0.2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='1'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function CardArt({ ink, paper, suit, rank }) {
  const glyph = SUITS[suit] ?? SUITS.spade;
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
            {rank}
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

export function IridescentCardPage({ designName }) {
  const t = useDesignTweaks(designName, CARD_TWEAKS);
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
    const onEnter = () => {
      stateRef.current.hv = 1;
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    let raf;
    const tick = () => {
      const s = stateRef.current;
      const k = 0.16;
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
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const [ink, paper] = PALETTES[t.paletteName] ?? PALETTES.bone;
  const noiseUrl = React.useMemo(() => makeNoiseUrl(t.noiseScale), [t.noiseScale]);
  const glowRgb = '184 198 255';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        background: 'radial-gradient(120% 90% at 50% 45%, #16161d 0%, #0a0a0e 45%, #04040a 100%)',
        display: 'grid',
        placeItems: 'center',
        perspective: 1400,
        color: '#cfcfd6',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
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
          width: 'clamp(280px, 28vw, 440px)',
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
            borderRadius: t.radius,
            background: paper,
            color: ink,
            transformStyle: 'preserve-3d',
            transform: `translateZ(calc(28px * var(--hover, 0))) scale(calc(1 + (0.04 * var(--hover, 0)))) rotateX(calc(var(--py, 0) * ${t.tilt}deg * -1)) rotateY(calc(var(--px, 0) * ${t.tilt}deg))`,
            transition:
              'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 calc(28px + 30px * var(--hover, 0)) calc(50px + 40px * var(--hover, 0)) rgba(0,0,0,0.55), inset 0 0 0 0.5px rgba(255,255,255,0.06), 0 0 calc(${t.glowSize}px * var(--hover, 0)) rgba(${glowRgb}, calc(${t.glowStrength} * var(--hover, 0)))`,
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
            <CardArt ink={ink} paper={paper} suit={t.suit} rank={t.rank} />
          </div>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 2,
              opacity: t.iridOpacity,
              mixBlendMode: t.iridBlend,
              filter: `saturate(${t.iridSat})`,
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
              mixBlendMode: 'screen',
              opacity: `calc(${t.specOpacity} * var(--hover, 0))`,
              background: `radial-gradient(circle at calc(var(--mx, 0.5) * 100%) calc(var(--my, 0.5) * 100%), #ffffff 0%, rgba(255,255,255,0) ${t.specSize}%)`,
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
              opacity: t.noiseOpacity,
              mixBlendMode: 'overlay',
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
