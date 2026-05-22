// Font catalog used by the Edit panel's Font selects.
//
// Three sources, merged in priority order:
//   1. In-document fonts — already scanned by getDocumentFonts() in
//      elementContext.js; the panel adds those itself.
//   2. Web-safe / system stacks — always available, no network.
//   3. Google Fonts — a hardcoded seed list of ~50 popular families always
//      available; the full ~1500-family catalog is fetched lazily IF
//      `VITE_GOOGLE_FONTS_API_KEY` is set (Vite exposes env vars prefixed
//      with VITE_ in the bundle).
//
// When a Google font is picked, the panel calls `ensureGoogleFontLoaded` to
// inject a <link rel="stylesheet"> so the font actually renders.

// ── Web-safe stacks ─────────────────────────────────────────────────────────
// Each entry is `{ value, label }`. `value` is what gets persisted as
// `font-family`; `label` is what the user sees in the dropdown.
export const WEB_SAFE_FONTS = [
  { value: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', label: 'System UI' },
  { value: 'ui-sans-serif, system-ui, sans-serif', label: 'Sans (UI)' },
  { value: 'ui-serif, Georgia, Cambria, "Times New Roman", serif', label: 'Serif (UI)' },
  { value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', label: 'Mono (UI)' },
  { value: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', label: 'Rounded (UI)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: '"Trebuchet MS", Helvetica, sans-serif', label: 'Trebuchet MS' },
  { value: '"Lucida Sans", "Lucida Grande", sans-serif', label: 'Lucida Sans' },
  { value: 'Impact, Charcoal, sans-serif', label: 'Impact' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Palatino Linotype", Palatino, serif', label: 'Palatino' },
  { value: 'Garamond, serif', label: 'Garamond' },
  { value: '"Brush Script MT", cursive', label: 'Brush Script MT' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans MS' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Menlo, Monaco, "Courier New", monospace', label: 'Menlo' },
];

// ── Google Fonts seed ───────────────────────────────────────────────────────
// Always available — these render the panel useful even without an API key.
// Roughly ordered by current popularity / designer favorites.
export const POPULAR_GOOGLE_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans 3',
  'Raleway',
  'Nunito',
  'Ubuntu',
  'Merriweather',
  'PT Sans',
  'Playfair Display',
  'Oswald',
  'Rubik',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'IBM Plex Serif',
  'Work Sans',
  'DM Sans',
  'DM Serif Display',
  'DM Mono',
  'Space Grotesk',
  'Space Mono',
  'JetBrains Mono',
  'Fira Code',
  'Fira Sans',
  'Manrope',
  'Plus Jakarta Sans',
  'Geist',
  'Geist Mono',
  'Outfit',
  'Lora',
  'Bricolage Grotesque',
  'Cormorant Garamond',
  'EB Garamond',
  'Libre Baskerville',
  'Crimson Text',
  'Source Serif 4',
  'Spectral',
  'Karla',
  'Quicksand',
  'Mulish',
  'Noto Sans',
  'Noto Serif',
  'Pacifico',
  'Dancing Script',
  'Caveat',
  'Permanent Marker',
  'Bebas Neue',
  'Anton',
  'Archivo',
  'Archivo Black',
  'Barlow',
  'Cabin',
  'Crimson Pro',
];

// Choose a sensible CSS generic fallback for a Google family.
function genericFallbackFor(family) {
  const monoHints = /(Mono|Code|Plex Mono|JetBrains|Fira Code|Space Mono|Courier)/i;
  const serifHints = /(Serif|Garamond|Baskerville|Lora|Spectral|Playfair|Merriweather|Crimson|EB Garamond|Cormorant)/i;
  if (monoHints.test(family)) return 'monospace';
  if (serifHints.test(family)) return 'serif';
  return 'sans-serif';
}

// Build the CSS font-family stack for a Google family. Always quotes the
// family name (covers multi-word families like "Open Sans") and appends a
// generic fallback so the text doesn't disappear while loading.
export function googleFontStack(family) {
  return `"${family}", ${genericFallbackFor(family)}`;
}

// ── Stylesheet injection ────────────────────────────────────────────────────
// Track loaded families so we don't inject duplicate <link>s when the user
// flips between elements that share a font. Module-scoped — survives panel
// remounts.
const loadedFamilies = new Set();

export function ensureGoogleFontLoaded(family) {
  if (!family || loadedFamilies.has(family)) return;
  loadedFamilies.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // css2 endpoint with `display=swap` so text shows immediately in the
  // fallback while the font downloads. `+` for spaces (the css2 endpoint's
  // preferred encoding).
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
  link.dataset.dsFontFamily = family;
  document.head.appendChild(link);
}

// ── API loader ──────────────────────────────────────────────────────────────
// Shared promise so multiple components hitting this don't fan out into
// multiple network calls. Resolves to an array of family names.
let catalogPromise = null;

export function loadGoogleFontsCatalog() {
  if (catalogPromise) return catalogPromise;
  const key =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_GOOGLE_FONTS_API_KEY
      : undefined;
  if (!key) {
    catalogPromise = Promise.resolve(POPULAR_GOOGLE_FONTS);
    return catalogPromise;
  }
  catalogPromise = fetch(
    `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(key)}&sort=popularity`,
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data?.items?.length) return POPULAR_GOOGLE_FONTS;
      // Drop duplicates with the seed and preserve the API's popularity order.
      return data.items.map((f) => f.family);
    })
    .catch(() => POPULAR_GOOGLE_FONTS);
  return catalogPromise;
}

// ── Merged catalog ──────────────────────────────────────────────────────────
// Returns the list ready to drop into a <select>. Each entry has the shape
// the SelectRow expects (`{ value, label }`) plus an optional `google` field
// the panel uses to call `ensureGoogleFontLoaded` on pick.
//
// `googleFamilies` is the family-name array (from POPULAR_GOOGLE_FONTS or the
// API). Web-safe entries are always included.
export function buildFontOptions(googleFamilies = POPULAR_GOOGLE_FONTS) {
  const opts = [];
  // System / web-safe first — designers want one-click for the obvious picks.
  opts.push({ kind: 'header', label: 'System' });
  for (const f of WEB_SAFE_FONTS) opts.push({ ...f, source: 'system' });
  opts.push({ kind: 'header', label: 'Google Fonts' });
  for (const family of googleFamilies) {
    opts.push({
      value: googleFontStack(family),
      label: family,
      google: family,
      source: 'google',
    });
  }
  return opts;
}
