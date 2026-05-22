import React from 'react';
import { useDesignTweaks } from '../../../../src/lib/tweaks-panel.jsx';

// Page tweaks: animation cadence + theme. Mounted only while this page is
// active so the global panel swaps with the page.
const STREAM_TWEAKS = {
  theme: {
    type: 'select',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    default: 'light',
  },
  speed: [1, 0.25, 3, 0.05],
};

const PROMPTS = [
  {
    q: 'How do plants breathe?',
    a: 'Plants breathe through tiny pores called stomata on their leaves, exchanging carbon dioxide and oxygen.',
  },
  {
    q: 'Define recursion.',
    a: 'Recursion is when a function calls itself, breaking a problem into smaller versions of the same problem.',
  },
  {
    q: 'Best pasta for pesto?',
    a: 'Trofie or trenette are traditional, but fusilli works beautifully — its grooves catch the sauce.',
  },
  {
    q: 'Why is the sky blue?',
    a: 'Shorter blue wavelengths scatter more than red ones as sunlight passes through the atmosphere.',
  },
  {
    q: 'Tip for better sleep?',
    a: 'Keep a consistent bedtime, dim lights an hour before, and skip screens in bed when you can.',
  },
  {
    q: 'What is jazz?',
    a: 'Jazz is improvised music born in New Orleans — built on swung rhythms, blues notes, and call and response.',
  },
  {
    q: 'Translate "good night" to French.',
    a: '"Good night" in French is "bonne nuit" — used before bed, not as a general goodbye.',
  },
  {
    q: 'Origin of the word "robot"?',
    a: '"Robot" comes from the Czech word "robota", meaning forced labor, coined in a 1920 play by Karel Čapek.',
  },
  {
    q: 'Quick stretch for desks?',
    a: 'Try a doorway chest stretch: arms at 90°, lean forward gently, hold for thirty seconds.',
  },
  {
    q: 'Why do cats purr?',
    a: 'Cats purr when content, but also to self-soothe — the vibrations may even help bones heal.',
  },
];

const VARIATIONS = [
  { name: 'Typewriter', sub: 'char · steady' },
  { name: 'Word fade', sub: 'word · opacity' },
  { name: 'Blur focus', sub: 'word · blur→0' },
  { name: 'Skeleton', sub: 'shimmer → text' },
  { name: 'Rise', sub: 'word · translateY' },
  { name: 'Scramble', sub: 'char · decode' },
  { name: 'Diffusion', sub: 'noise → resolve' },
  { name: 'Sweep', sub: 'gradient mask' },
  { name: 'Letter drop', sub: 'char · drop in' },
  { name: 'Token burst', sub: 'chunk · rise+fade' },
];

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!?@#%&*+/<>';
const randCh = () => SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

// Each runner is an async function that takes (botEl, answer, alive, speed)
// and mutates the bot bubble in place. The `alive` ref lets the loop abort
// when the page unmounts mid-animation. `speed` scales every sleep.
function makeRunners() {
  const sleep = (ms, alive, speed = 1) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(1, ms / speed)).unref?.() ?? resolve);
  // (unref not available in browser; the .unref?.() is harmless.)
  const wait = (ms, alive, speed) =>
    new Promise((r) => {
      if (!alive.current) return r();
      const id = setTimeout(r, Math.max(1, ms / (speed || 1)));
      return id;
    });

  return [
    // 01 Typewriter
    async (bot, ans, alive, speed) => {
      bot.innerHTML = `<span class="t"></span><span class="ts-caret"></span>`;
      const t = bot.querySelector('.t');
      for (let i = 0; i < ans.length && alive.current; i++) {
        t.textContent += ans[i];
        await wait(ans[i] === ' ' ? 18 : 26 + Math.random() * 22, alive, speed);
      }
      bot.querySelector('.ts-caret')?.remove();
    },
    // 02 Word fade
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      const words = ans.split(/(\s+)/);
      for (const w of words) {
        if (!alive.current) break;
        if (/^\s+$/.test(w)) {
          bot.append(document.createTextNode(w));
          continue;
        }
        const s = document.createElement('span');
        s.className = 'ts-w-fade';
        s.textContent = w;
        bot.appendChild(s);
        await wait(70, alive, speed);
      }
    },
    // 03 Blur focus
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      const words = ans.split(/(\s+)/);
      for (const w of words) {
        if (!alive.current) break;
        if (/^\s+$/.test(w)) {
          bot.append(document.createTextNode(w));
          continue;
        }
        const s = document.createElement('span');
        s.className = 'ts-w-blur';
        s.textContent = w;
        bot.appendChild(s);
        await wait(90, alive, speed);
      }
      await wait(500, alive, speed);
    },
    // 04 Skeleton → text
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      const widths = [88, 74, 52];
      for (let i = 0; i < 3; i++) {
        const sk = document.createElement('span');
        sk.className = 'ts-skel';
        sk.style.width = widths[i] + '%';
        sk.style.display = 'block';
        sk.style.marginBottom = '6px';
        bot.appendChild(sk);
      }
      await wait(1100, alive, speed);
      if (!alive.current) return;
      bot.innerHTML = `<span class="t"></span><span class="ts-caret"></span>`;
      const t = bot.querySelector('.t');
      for (let i = 0; i < ans.length && alive.current; i++) {
        t.textContent += ans[i];
        await wait(14, alive, speed);
      }
      bot.querySelector('.ts-caret')?.remove();
    },
    // 05 Rise
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      const words = ans.split(/(\s+)/);
      for (const w of words) {
        if (!alive.current) break;
        if (/^\s+$/.test(w)) {
          bot.append(document.createTextNode(w));
          continue;
        }
        const s = document.createElement('span');
        s.className = 'ts-w-slide';
        s.textContent = w;
        bot.appendChild(s);
        await wait(85, alive, speed);
      }
    },
    // 06 Scramble decode
    async (bot, ans, alive, speed) => {
      bot.innerHTML = `<span class="t ts-scramble"></span><span class="ts-caret"></span>`;
      const t = bot.querySelector('.t');
      const total = ans.length;
      const buf = new Array(total).fill(' ');
      let revealed = 0;
      while (revealed < total && alive.current) {
        revealed++;
        for (let i = 0; i < revealed; i++) buf[i] = ans[i];
        const noiseLen = Math.min(6, total - revealed);
        for (let i = revealed; i < revealed + noiseLen; i++) {
          buf[i] = ans[i] === ' ' ? ' ' : randCh();
        }
        for (let i = revealed + noiseLen; i < total; i++) buf[i] = '';
        t.textContent = buf.join('');
        await wait(28, alive, speed);
      }
      if (alive.current) t.textContent = ans;
      bot.querySelector('.ts-caret')?.remove();
    },
    // 07 Diffusion
    async (bot, ans, alive, speed) => {
      bot.innerHTML = `<span class="t ts-scramble"></span>`;
      const t = bot.querySelector('.t');
      const N = ans.length;
      const resolved = new Array(N).fill(false);
      const order = [...Array(N).keys()].sort(() => Math.random() - 0.5);
      const buf = ans.split('').map((c) => (c === ' ' ? ' ' : randCh()));
      t.textContent = buf.join('');
      const total = 1600;
      const start = performance.now();
      let done = 0;
      while (done < N && alive.current) {
        const elapsed = performance.now() - start;
        const targetDone = Math.min(N, Math.floor(((elapsed * (speed || 1)) / total) * N));
        while (done < targetDone) {
          const idx = order[done];
          buf[idx] = ans[idx];
          resolved[idx] = true;
          done++;
        }
        for (let i = 0; i < N; i++) {
          if (!resolved[i] && ans[i] !== ' ') buf[i] = randCh();
        }
        t.textContent = buf.join('');
        await wait(40, alive, speed);
      }
      if (alive.current) t.textContent = ans;
    },
    // 08 Sweep
    async (bot, ans, alive, speed) => {
      bot.innerHTML = `<span class="ts-mask-reveal">${escapeHtml(ans)}</span>`;
      const m = bot.querySelector('.ts-mask-reveal');
      const steps = 40;
      for (let i = 0; i <= steps && alive.current; i++) {
        const p = 100 - (i / steps) * 100;
        m.style.backgroundPosition = p + '% 0';
        await wait(35, alive, speed);
      }
    },
    // 09 Letter drop
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      let delay = 0;
      for (const ch of ans) {
        if (!alive.current) break;
        if (ch === ' ') {
          bot.append(document.createTextNode(' '));
          continue;
        }
        const s = document.createElement('span');
        s.className = 'ts-l-drop';
        s.style.animationDelay = (delay / (speed || 1)).toFixed(0) + 'ms';
        s.textContent = ch;
        bot.appendChild(s);
        delay += 22;
      }
      await wait(delay + 320, alive, speed);
    },
    // 10 Token burst
    async (bot, ans, alive, speed) => {
      bot.innerHTML = '';
      const words = ans.split(/(\s+)/);
      const chunks = [];
      let buf = [];
      let count = 0;
      for (const w of words) {
        buf.push(w);
        if (!/^\s+$/.test(w)) count++;
        if (count >= 2 + Math.floor(Math.random() * 2)) {
          chunks.push(buf.join(''));
          buf = [];
          count = 0;
        }
      }
      if (buf.length) chunks.push(buf.join(''));
      for (const c of chunks) {
        if (!alive.current) break;
        const s = document.createElement('span');
        s.className = 'ts-chunk';
        s.textContent = c;
        bot.appendChild(s);
        await wait(150 + Math.random() * 120, alive, speed);
      }
      await wait(300, alive, speed);
    },
  ];
}

// Keyframes + helper classes live in a <style> tag rendered by the component
// so they tear down with the page. `ts-` prefix avoids collisions with the
// host or other designs.
const STREAM_STYLES = `
.ts-stage { font-family: Helvetica, "Helvetica Neue", Arial, sans-serif; }
.ts-stage *, .ts-stage *::before, .ts-stage *::after { box-sizing: border-box; }
.ts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.ts-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  min-height: 280px;
  background: var(--ts-card);
  border: 1px solid var(--ts-line);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ts-cell .ts-label {
  position: absolute; top: 12px; left: 14px;
  font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px; color: var(--ts-ink-3);
  letter-spacing: 0.08em; text-transform: uppercase;
  display: flex; gap: 8px; align-items: center;
}
.ts-cell .ts-label .ts-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--ts-ink);
  animation: ts-heartbeat 1.4s ease-in-out infinite;
}
@keyframes ts-heartbeat { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
.ts-cell .ts-name {
  position: absolute; top: 12px; right: 14px;
  font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px; color: var(--ts-ink-3); letter-spacing: 0.04em;
}
.ts-chat {
  flex: 1; padding: 44px 16px 16px;
  display: flex; flex-direction: column; justify-content: flex-end;
  gap: 10px; overflow: hidden;
}
.ts-bubble {
  max-width: 84%; padding: 8px 12px; border-radius: 14px;
  font-size: 13px; line-height: 1.4; word-wrap: break-word;
}
.ts-bubble.ts-user {
  align-self: flex-end;
  background: var(--ts-user); color: var(--ts-user-ink);
  border-bottom-right-radius: 4px;
}
.ts-bubble.ts-bot {
  align-self: flex-start;
  background: var(--ts-bot); color: var(--ts-ink);
  border-bottom-left-radius: 4px;
  min-height: 1.4em; min-width: 30px; position: relative;
}
.ts-caret {
  display: inline-block; width: 6px; height: 1em; transform: translateY(2px);
  background: var(--ts-ink); margin-left: 1px;
  animation: ts-blink 0.85s steps(2) infinite;
}
@keyframes ts-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.ts-w-fade { opacity: 0; animation: ts-wfade 0.32s ease forwards; display: inline-block; }
@keyframes ts-wfade { to { opacity: 1; } }
.ts-w-blur { opacity: 0; filter: blur(8px); display: inline-block;
  animation: ts-wblur 0.5s ease forwards; }
@keyframes ts-wblur { to { opacity: 1; filter: blur(0); } }
.ts-w-slide { display: inline-block; transform: translateY(0.6em); opacity: 0;
  animation: ts-wslide 0.35s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes ts-wslide { to { transform: translateY(0); opacity: 1; } }
.ts-l-drop { display: inline-block; transform: translateY(-0.4em); opacity: 0;
  animation: ts-ldrop 0.28s cubic-bezier(.4,1.5,.4,1) forwards; }
@keyframes ts-ldrop { to { transform: translateY(0); opacity: 1; } }
.ts-skel {
  display: inline-block; height: 0.9em; border-radius: 4px;
  background: linear-gradient(90deg, var(--ts-skel-1) 0%, var(--ts-skel-2) 30%,
    var(--ts-skel-3) 50%, var(--ts-skel-2) 70%, var(--ts-skel-1) 100%);
  background-size: 220% 100%;
  animation: ts-shimmer 1.1s linear infinite;
  vertical-align: middle; margin: 2px 0;
}
@keyframes ts-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
.ts-mask-reveal {
  background: linear-gradient(90deg, var(--ts-ink) 50%, var(--ts-ink-3) 50%);
  background-size: 200% 100%; background-position: 100% 0;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  transition: background-position 0.15s linear;
}
.ts-chunk { display: inline-block; opacity: 0; transform: translateY(4px);
  animation: ts-chunkIn 0.45s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes ts-chunkIn { to { opacity: 1; transform: translateY(0); } }
.ts-scramble { font-variant-numeric: tabular-nums; }
.ts-td {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--ts-ink-3); display: inline-block;
  animation: ts-td 1s ease-in-out infinite;
}
.ts-td2 { animation-delay: 0.15s; }
.ts-td3 { animation-delay: 0.30s; }
@keyframes ts-td {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-3px); opacity: 1; }
}
`;

const THEMES = {
  light: {
    '--ts-bg': '#f4f4f2',
    '--ts-ink': '#111111',
    '--ts-ink-2': '#555555',
    '--ts-ink-3': '#9a9a98',
    '--ts-card': '#ffffff',
    '--ts-line': '#e8e8e5',
    '--ts-user': '#111111',
    '--ts-user-ink': '#f4f4f2',
    '--ts-bot': '#ececea',
    '--ts-skel-1': '#d6d6d3',
    '--ts-skel-2': '#ececea',
    '--ts-skel-3': '#f7f7f5',
  },
  dark: {
    '--ts-bg': '#0c0c10',
    '--ts-ink': '#f4f4f2',
    '--ts-ink-2': '#a8a8a4',
    '--ts-ink-3': '#6a6a68',
    '--ts-card': '#16161a',
    '--ts-line': '#23232a',
    '--ts-user': '#f4f4f2',
    '--ts-user-ink': '#0c0c10',
    '--ts-bot': '#1d1d22',
    '--ts-skel-1': '#1d1d22',
    '--ts-skel-2': '#26262d',
    '--ts-skel-3': '#33333a',
  },
};

export function TextStreamingPage({ designName }) {
  const t = useDesignTweaks(designName, STREAM_TWEAKS);
  const aliveRef = React.useRef({ current: true });
  const speedRef = React.useRef(t.speed);
  speedRef.current = t.speed;

  // Spawn one looping animation per cell on mount; tear them down via the
  // shared alive ref on unmount.
  const cellRefs = React.useRef([]);
  React.useEffect(() => {
    const alive = { current: true };
    aliveRef.current = alive;
    const runners = makeRunners();
    const wait = (ms) =>
      new Promise((r) => setTimeout(r, Math.max(1, ms / (speedRef.current || 1))));

    async function loopCell(idx) {
      const cell = cellRefs.current[idx];
      if (!cell) return;
      const user = cell.querySelector('.ts-bubble.ts-user');
      const bot = cell.querySelector('.ts-bubble.ts-bot');
      const prompt = PROMPTS[idx];
      while (alive.current) {
        user.textContent = '';
        bot.innerHTML = '';
        await wait(350);
        if (!alive.current) break;
        for (let i = 0; i < prompt.q.length && alive.current; i++) {
          user.textContent += prompt.q[i];
          await wait(18);
        }
        await wait(420);
        if (!alive.current) break;
        bot.innerHTML = `<span style="display:inline-flex;gap:3px;align-items:center;height:1em;"><span class="ts-td"></span><span class="ts-td ts-td2"></span><span class="ts-td ts-td3"></span></span>`;
        await wait(650);
        if (!alive.current) break;
        try {
          await runners[idx](bot, prompt.a, alive, speedRef.current);
        } catch {
          bot.textContent = prompt.a;
        }
        if (!alive.current) break;
        await wait(2400);
      }
    }

    VARIATIONS.forEach((_, i) => {
      setTimeout(() => {
        if (alive.current) loopCell(i);
      }, i * 220);
    });
    return () => {
      alive.current = false;
    };
  }, []);

  const themeVars = THEMES[t.theme] ?? THEMES.light;

  return (
    <div
      className="ts-stage"
      style={{
        ...themeVars,
        background: 'var(--ts-bg)',
        color: 'var(--ts-ink)',
        minHeight: '100vh',
        padding: '40px 32px 80px',
      }}
    >
      <style>{STREAM_STYLES}</style>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 24,
          margin: '0 auto 28px',
          maxWidth: 1640,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--ts-ink)',
          }}
        >
          Text streaming — ten ways to render a response
        </h1>
        <span
          style={{
            fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
            fontSize: 11,
            color: 'var(--ts-ink-2)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          10 variations · {t.theme} · looped
        </span>
      </header>
      <div className="ts-grid" style={{ maxWidth: 1640, margin: '0 auto' }}>
        {VARIATIONS.map((v, i) => (
          <div key={v.name} ref={(el) => (cellRefs.current[i] = el)} className="ts-cell">
            <div className="ts-label">
              <span className="ts-dot" />
              {String(i + 1).padStart(2, '0')} · {v.name}
            </div>
            <div className="ts-name">{v.sub}</div>
            <div className="ts-chat">
              <div className="ts-bubble ts-user" />
              <div className="ts-bubble ts-bot" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
