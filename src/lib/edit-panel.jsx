import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { colord } from 'colord';
import { ChevronDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import { stylesToCssRule } from './css-property-schema.js';
import { ensureDsRef, getDocumentColors, getDocumentFonts } from './elementContext.js';
import {
  buildFontOptions,
  ensureGoogleFontLoaded,
  loadGoogleFontsCatalog,
  POPULAR_GOOGLE_FONTS,
} from './font-catalog.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function splitUnit(val, fallback = 'px') {
  if (val == null || val === '') return { num: '', unit: fallback };
  const s = String(val).trim();
  const m = s.match(/^(-?[\d.]+)\s*(.*)$/);
  if (!m) return { num: s, unit: '' };
  return { num: m[1], unit: m[2] || fallback };
}

function joinUnit(num, unit) {
  if (num === '' || num == null) return '';
  return unit ? `${num}${unit}` : String(num);
}

function colorToHex(value) {
  if (!value) return '#00000000';
  const c = colord(value);
  return c.isValid() ? c.toHex() : '#00000000';
}

// Canonical representation for a persisted color:
//   • fully opaque → 6-char hex (#RRGGBB, uppercased)
//   • transparent  → rgba(R, G, B, A) with 2 decimal alpha
// react-colorful's HexAlphaColorPicker always emits 8-char hex (#RRGGBBAA);
// we re-format so the input shows the friendlier representation.
function normalizeColorValue(input) {
  if (!input) return '';
  const c = colord(String(input).trim());
  if (!c.isValid()) return input;
  const { r, g, b, a } = c.toRgb();
  if (a >= 1) return c.toHex().toUpperCase().slice(0, 7);
  const alpha = Math.round(a * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── validation ───────────────────────────────────────────────────────────────

const LENGTH_RE = /^-?[\d.]+(px|em|rem|%|vh|vw|fr|auto)?$|^auto$/;
const LENGTH_KEYS = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderWidth',
  'left',
  'top',
  'right',
  'bottom',
]);
const COLOR_KEYS = new Set(['color', 'backgroundColor', 'background', 'borderColor']);
const FONT_WEIGHT_VALUES = new Set([
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  'normal',
  'bold',
  'lighter',
  'bolder',
]);

// Returns true when value is valid, or a string error message otherwise.
// Empty values are treated as "clear" and always pass.
export function validateStyleValue(key, value) {
  if (value == null || value === '') return true;
  const v = String(value).trim();

  if (LENGTH_KEYS.has(key)) {
    // Allow a bare number — splitUnit re-joins it with the default unit.
    if (LENGTH_RE.test(v)) return true;
    return 'Invalid CSS length';
  }

  if (COLOR_KEYS.has(key)) {
    return colord(v).isValid() ? true : 'Invalid color';
  }

  if (key === 'fontWeight') {
    return FONT_WEIGHT_VALUES.has(v) ? true : 'Invalid font weight';
  }

  if (key === 'opacity') {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Invalid opacity';
    // Accept either 0..1 (CSS) or 0..100 (percent) — both flow through OpacityRow.
    if (n < 0 || n > 100) return 'Out of range';
    return true;
  }

  return true;
}

// Quick lint pass over a free-form CSS declaration block. Returns null when
// the text looks OK, or a string error otherwise. Tolerates a trailing
// declaration with no semicolon (common while typing).
export function validateCssText(text) {
  if (!text || !text.trim()) return null;
  const s = text.trim();
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) return 'Mismatched braces';
    }
  }
  if (depth !== 0) return 'Mismatched braces';

  // Strip nested blocks for the missing-semicolon check.
  const flat = s.replace(/\{[^}]*\}/g, '');
  const parts = flat
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  // Every part except possibly the last must look like `prop: value`.
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!parts[i].includes(':')) return 'Missing semicolon or colon';
  }
  const last = parts[parts.length - 1];
  if (last && !last.includes(':')) return 'Last declaration is malformed';
  return null;
}

function opacityPercent(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 100;
  return Math.round(n <= 1 ? n * 100 : n);
}

// Short identity string for the panel header — surfaces tag + first class /
// data-ds-ref so AT (and sighted users) know which element is being edited.
function describeElForHeader(el) {
  if (!el) return '';
  const tag = el.tagName?.toLowerCase() || 'element';
  const ref = el.getAttribute?.('data-ds-ref');
  if (ref) return `<${tag}> · ${ref}`;
  const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean)[0];
  return cls ? `<${tag}>.${cls}` : `<${tag}>`;
}

// All-equal check for 4-side shorthand preview ("0 px" when T=R=B=L).
function shorthandPreview(styles, keys, fallbackUnit = 'px') {
  const values = keys.map((k) => styles[k]);
  if (values.every((v) => !v || v === '0' || v === '0px')) return `0 ${fallbackUnit}`;
  const allSame = values.every((v) => v === values[0]);
  if (allSame) return String(values[0]);
  return 'Mixed';
}

// ─── field shell ──────────────────────────────────────────────────────────────

const ROW_CLS =
  'flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring';
const ROW_INVALID_CLS = 'border-destructive ring-1 ring-destructive/30';

function FieldShell({ inputId, label, children, className, invalid = false, errorId }) {
  return (
    <div
      className={cn(ROW_CLS, invalid && ROW_INVALID_CLS, className)}
      data-invalid={invalid || undefined}
    >
      {label != null && (
        <label htmlFor={inputId} className="shrink-0 cursor-default text-xs text-muted-foreground">
          {label}
        </label>
      )}
      {children}
      {invalid && errorId && (
        <span id={errorId} role="alert" className="sr-only">
          Invalid value
        </span>
      )}
    </div>
  );
}

// IME guard: don't fire onChange mid-composition so partial CJK/accent input
// isn't validated and rejected before the user finishes composing.
function FieldInput({ value, onChange, invalid = false, errorId, ...props }) {
  const composingRef = useRef(false);
  return (
    <input
      {...props}
      value={value ?? ''}
      onCompositionStart={(e) => {
        composingRef.current = true;
        props.onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        props.onCompositionEnd?.(e);
        onChange(e.currentTarget.value);
      }}
      onChange={(e) => {
        if (composingRef.current) return;
        onChange(e.target.value);
      }}
      aria-invalid={invalid || undefined}
      aria-errormessage={invalid && errorId ? errorId : undefined}
      className={cn(
        'min-w-0 flex-1 border-0 bg-transparent text-right text-sm text-foreground outline-none focus-visible:outline-none',
        props.className,
      )}
    />
  );
}

// Local-input wrapper for fields that need to hold an in-progress draft while
// the user is typing a value that doesn't (yet) validate. When the draft
// validates, it bubbles up via `onChange`. When the underlying value changes
// externally, the draft resyncs.
function useDraft(value, validate) {
  const [draft, setDraft] = useState(value ?? '');
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setDraft(value ?? '');
    }
  }, [value]);
  const result = validate ? validate(draft) : true;
  const error = result === true ? null : result;
  return { draft, setDraft, error };
}

function NumericRow({ label, value, onChange, unit = 'px', full = false, styleKey }) {
  const id = useId();
  const errorId = `${id}-err`;
  const { num, unit: u } = splitUnit(value, unit);
  // Validate the joined "num+unit" string, since that's what gets persisted.
  const [draftNum, setDraftNum] = useState(num);
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setDraftNum(splitUnit(value, unit).num);
    }
  }, [value, unit]);

  const joined = joinUnit(draftNum, u || unit);
  const valid = !styleKey || draftNum === '' ? true : validateStyleValue(styleKey, joined);
  const invalid = valid !== true;

  const handleChange = (v) => {
    setDraftNum(v);
    const next = joinUnit(v, u || unit);
    if (v === '' || !styleKey || validateStyleValue(styleKey, next) === true) {
      onChange(next);
    }
  };

  // Arrow-up / arrow-down bumps the numeric value by ±1 (×10 with Shift,
  // ×0.1 with Alt — matching Figma / DevTools convention).
  const handleKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const current = parseFloat(draftNum);
    if (!Number.isFinite(current)) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const direction = e.key === 'ArrowUp' ? 1 : -1;
    const next = current + step * direction;
    // Round to 4 decimals to avoid float drift (1.1 - 0.1 = 1.0000000000000002).
    const rounded = Math.round(next * 10000) / 10000;
    handleChange(String(rounded));
  };

  return (
    <FieldShell
      inputId={id}
      label={label}
      className={full ? 'w-full' : undefined}
      invalid={invalid}
      errorId={invalid ? errorId : undefined}
    >
      <FieldInput
        id={id}
        value={draftNum}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        inputMode="decimal"
        invalid={invalid}
        errorId={errorId}
        aria-keyshortcuts="ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Alt+ArrowUp Alt+ArrowDown"
      />
      <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
        {u || unit}
      </span>
    </FieldShell>
  );
}

function TextRow({ label, value, onChange, placeholder, full = false, mono = false, styleKey }) {
  const id = useId();
  const errorId = `${id}-err`;
  const validate = styleKey ? (v) => validateStyleValue(styleKey, v) : null;
  const { draft, setDraft, error } = useDraft(value, validate);
  const invalid = !!error;

  const handleChange = (v) => {
    setDraft(v);
    if (v === '' || !styleKey || validateStyleValue(styleKey, v) === true) {
      onChange(v);
    }
  };

  return (
    <FieldShell
      inputId={id}
      label={label}
      className={full ? 'w-full' : undefined}
      invalid={invalid}
      errorId={invalid ? errorId : undefined}
    >
      <FieldInput
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={handleChange}
        className={mono ? 'font-mono text-xs' : undefined}
        invalid={invalid}
        errorId={errorId}
      />
    </FieldShell>
  );
}

function SelectRow({ label, value, options, onChange, full = false }) {
  const id = useId();
  // Normalize: strings → {label, value}; headers stay as-is.
  const opts = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  // Group consecutive non-header entries under the most-recent header into
  // <optgroup> for visual grouping (System / Google Fonts / etc.). Entries
  // before any header render flat at the top of the list.
  const groups = [];
  let current = { label: null, items: [] };
  groups.push(current);
  for (const o of opts) {
    if (o.kind === 'header') {
      current = { label: o.label, items: [] };
      groups.push(current);
    } else {
      current.items.push(o);
    }
  }
  return (
    <FieldShell inputId={id} label={label} className={cn('relative', full && 'w-full')}>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent pr-6 text-right text-sm text-foreground outline-none focus-visible:outline-none"
      >
        <option value="">—</option>
        {groups.map((g, gi) => {
          if (g.items.length === 0) return null;
          if (!g.label) {
            return g.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ));
          }
          return (
            <optgroup key={`${g.label}-${gi}`} label={g.label}>
              {g.items.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-3 text-muted-foreground"
      />
    </FieldShell>
  );
}

// Lazy-scan once when shown — getDocumentColors is cheap (~500 nodes) but no
// reason to redo it on every keystroke in the picker.
function DocumentColorSwatches({ onPick }) {
  const [colors, setColors] = useState(null);
  useEffect(() => {
    setColors(getDocumentColors());
  }, []);
  if (!colors?.length) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-1"
      role="group"
      aria-label="Colors used in this document"
    >
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Use ${c}`}
          title={c}
          onClick={() => onPick(c)}
          className="size-6 shrink-0 rounded border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
          }}
        >
          <span className="block size-full rounded-[3px]" style={{ background: c }} />
        </button>
      ))}
    </div>
  );
}

function ColorRow({ label, value, onChange, full = false }) {
  const id = useId();
  const errorId = `${id}-err`;
  const hex = colorToHex(value);
  const swatch = colord(hex).isValid() ? hex : 'transparent';

  // Track an in-progress hex/rgb string so the user can type freely; only
  // commit upstream once colord parses it.
  const [draft, setDraft] = useState(value ?? '');
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setDraft(value ?? '');
    }
  }, [value]);
  const invalid = draft !== '' && !colord(draft).isValid();

  const handleInput = (v) => {
    setDraft(v);
    if (v === '' || colord(v).isValid()) onChange(v);
  };

  // Picker emits 8-char hex (#RRGGBBAA); persist as either a 6-char hex
  // (#RRGGBB) or rgba(...) depending on whether alpha is set.
  const handlePicker = (v) => {
    const normalized = normalizeColorValue(v);
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <FieldShell
      inputId={id}
      label={label}
      className={full ? 'w-full' : undefined}
      invalid={invalid}
      errorId={invalid ? errorId : undefined}
    >
      <Popover>
        <PopoverTrigger
          render={(props) => (
            <button
              type="button"
              {...props}
              className="size-4 shrink-0 rounded border border-foreground/20 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
              }}
              aria-label={`${label}: pick color`}
            >
              <span className="block size-full rounded-[3px]" style={{ background: swatch }} />
            </button>
          )}
        />
        <PopoverContent
          align="end"
          className="w-auto p-3"
          role="dialog"
          aria-label={`${label} color picker — use the hex input for keyboard entry`}
        >
          <HexAlphaColorPicker color={hex} onChange={handlePicker} />
          <DocumentColorSwatches onPick={handlePicker} />
        </PopoverContent>
      </Popover>
      <FieldInput
        id={id}
        value={draft}
        onChange={handleInput}
        placeholder="auto"
        className="min-w-[10ch] font-mono text-xs"
        invalid={invalid}
        errorId={errorId}
      />
    </FieldShell>
  );
}

function OpacityRow({ value, onChange }) {
  const id = useId();
  const pct = opacityPercent(value);
  // Base UI's Slider passes a number for single-thumb, array for range. Handle
  // both so we don't quietly fail.
  const apply = (v) => {
    const n = Array.isArray(v) ? v[0] : v;
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(1, Math.max(0, n / 100));
    onChange(String(clamped));
  };
  return (
    <FieldShell inputId={id} label="Opacity" className="w-full">
      <Slider
        id={id}
        aria-label="Opacity"
        aria-valuetext={`${pct} percent`}
        value={[pct]}
        min={0}
        max={100}
        step={1}
        onValueChange={apply}
        className="min-w-0 flex-1"
      />
      <span aria-hidden className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">
        {pct}
      </span>
      <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
        %
      </span>
    </FieldShell>
  );
}

// ─── collapsible spacing block (Padding / Margin / Border) ───────────────────

function SpacingBlock({ label, keyForSide, valueFor, setStyle, unit = 'px' }) {
  const [open, setOpen] = useState(false);
  const keys = ['Top', 'Right', 'Bottom', 'Left'].map(keyForSide);
  const previewStyles = Object.fromEntries(keys.map((k) => [k, valueFor(k)]));
  const preview = shorthandPreview(previewStyles, keys, unit);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={(props) => (
          <button type="button" {...props} className={cn(ROW_CLS, 'w-full text-left')}>
            <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
            <span className="ml-auto text-sm tabular-nums text-foreground">{preview}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        )}
      />
      <CollapsibleContent>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {['Top', 'Right', 'Bottom', 'Left'].map((side) => {
            const key = keyForSide(side);
            return (
              <NumericRow
                key={key}
                label={side}
                value={valueFor(key)}
                onChange={(v) => setStyle(key, v)}
                unit={unit}
                styleKey={key}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── live preview ─────────────────────────────────────────────────────────────

// Render-side live preview. The CSS rule injection is harmless — it has no
// effect when styles is empty. The textContent mutation is destructive (it can
// wipe child elements), so it only fires when textChanged === true.
function useLivePreview(ref, el, styles, cssText, textContent, textChanged) {
  const originalText = useRef(null);

  useEffect(() => {
    if (!el) return undefined;
    originalText.current = el.textContent;
    return () => {
      if (textChanged && originalText.current != null) {
        // Only restore if we actually mutated text.
        try {
          el.textContent = originalText.current;
        } catch {
          /* element may be unmounted */
        }
      }
    };
    // Intentional: restore only on element change/unmount, not on textChanged toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el]);

  useEffect(() => {
    if (!el || !textChanged || textContent == null) return;
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      el.firstChild.textContent = textContent;
    } else if (!el.querySelector('[data-ds-ref]') && el.children.length === 0) {
      // Only replace textContent if the element has no element children at all —
      // otherwise we'd destroy structure (the gray-box bug).
      el.textContent = textContent;
    }
  }, [el, textContent, textChanged]);

  const rule = useMemo(() => stylesToCssRule(ref, { styles, cssText }), [ref, styles, cssText]);
  if (!rule) return null;
  return <style data-ds-edit-preview>{rule}</style>;
}

// ─── option lists ─────────────────────────────────────────────────────────────

// Shared hook for the Font select. Returns a fully-grouped option list with
// system stacks + Google Fonts. The Google list starts as the static
// popular-seed; when an API key is configured, the full ~1500-family list is
// fetched in the background and the array swaps in.
//
// Also returns a `pickFont` that callers wrap their setStyle in so the
// stylesheet is injected on the way out.
function useFontOptions(currentValue, inDocFonts = []) {
  const [googleFamilies, setGoogleFamilies] = useState(POPULAR_GOOGLE_FONTS);
  useEffect(() => {
    let cancelled = false;
    loadGoogleFontsCatalog().then((list) => {
      if (!cancelled && list?.length) setGoogleFamilies(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const base = buildFontOptions(googleFamilies);
    // Prepend in-document fonts (computed values picked up from getDocumentFonts)
    // so the user can always pick a font that's already in use. Skip ones that
    // already exist as labels in the catalog.
    const known = new Set(base.filter((o) => o.value).map((o) => o.label));
    const inDoc = [];
    for (const f of inDocFonts) {
      if (!f || known.has(f)) continue;
      inDoc.push({ value: f, label: f, source: 'in-doc' });
      known.add(f);
    }
    // If the currently-saved value isn't anywhere in the list, surface it at
    // the top so the dropdown reflects reality.
    const allValues = new Set(base.filter((o) => o.value).map((o) => o.value));
    const orphan =
      currentValue && !allValues.has(currentValue)
        ? [{ value: currentValue, label: currentValue, source: 'current' }]
        : [];
    return [
      ...orphan,
      ...(inDoc.length ? [{ kind: 'header', label: 'In document' }, ...inDoc] : []),
      ...base,
    ];
  }, [googleFamilies, inDocFonts, currentValue]);

  const valueToGoogle = useMemo(() => {
    const map = new Map();
    for (const o of options) {
      if (o.google && o.value) map.set(o.value, o.google);
    }
    return map;
  }, [options]);

  const pickFont = (next) => {
    const family = valueToGoogle.get(next);
    if (family) ensureGoogleFontLoaded(family);
  };

  return { options, pickFont };
}

const WEIGHT_OPTIONS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const ALIGN_OPTIONS = ['left', 'center', 'right', 'justify'];
const DIRECTION_OPTIONS = ['row', 'row-reverse', 'column', 'column-reverse'];
const JUSTIFY_OPTIONS = [
  { label: 'start', value: 'flex-start' },
  { label: 'center', value: 'center' },
  { label: 'end', value: 'flex-end' },
  { label: 'between', value: 'space-between' },
  { label: 'around', value: 'space-around' },
];
const ALIGN_ITEMS_OPTIONS = [
  { label: 'start', value: 'flex-start' },
  { label: 'center', value: 'center' },
  { label: 'end', value: 'flex-end' },
  { label: 'stretch', value: 'stretch' },
];
const BORDER_STYLE_OPTIONS = ['none', 'solid', 'dashed', 'dotted'];
const DISPLAY_OPTIONS = [
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'none',
];
const FLEX_OR_GRID = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);

// ─── section header ──────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </h3>
  );
}

// Style keys that count toward "has user-edited content" per section. When any
// key here is set in `styles` (in-flight edits) or persisted `overrides.styles`,
// the corresponding section defaults to open; otherwise it stays collapsed so
// designers aren't faced with ~25 controls at once.
const SECTION_KEYS = {
  Typography: [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'color',
    'textAlign',
    'lineHeight',
    'letterSpacing',
  ],
  Size: ['width', 'height'],
  Layout: ['display', 'gap', 'flexDirection', 'justifyContent', 'alignItems'],
  Position: ['position', 'left', 'top', 'right', 'bottom'],
  // Box matches any key starting with padding/margin/border, plus a fixed set.
  Box: ['backgroundColor', 'background', 'opacity', 'borderRadius'],
  Effects: ['boxShadow', 'transform'],
};

function isBoxKey(k) {
  return (
    k === 'backgroundColor' ||
    k === 'background' ||
    k === 'opacity' ||
    k === 'borderRadius' ||
    k.startsWith('padding') ||
    k.startsWith('margin') ||
    k.startsWith('border')
  );
}

function hasOverrideForSection(section, ...maps) {
  for (const m of maps) {
    if (!m) continue;
    const keys = Object.keys(m);
    if (!keys.length) continue;
    if (section === 'Box') {
      if (keys.some((k) => isBoxKey(k) && m[k] !== '' && m[k] != null)) return true;
      continue;
    }
    const allowed = SECTION_KEYS[section];
    if (allowed && allowed.some((k) => m[k] !== '' && m[k] != null)) return true;
  }
  return false;
}

// Collapsible <section> for the element edit panel. Wraps content in a
// Collapsible that's seeded from `defaultOpen` (sections with user-edited
// values open by default; pristine sections collapse to reduce the ~25-control
// dump). After mount, user toggles take over — defaultOpen only seeds initial
// state. Chevron rotates on open, matching the SpacingBlock pattern.
function SectionCollapsible({ title, defaultOpen, preview, swatch, children }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="flex flex-col gap-2">
        <CollapsibleTrigger
          render={(props) => (
            <button
              type="button"
              {...props}
              className={cn(ROW_CLS, 'w-full justify-between gap-2 text-left')}
            >
              <SectionLabel>{title}</SectionLabel>
              <span className="ml-auto flex min-w-0 items-center gap-1.5">
                {swatch ? (
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-[3px] border border-border"
                    style={{ background: swatch }}
                  />
                ) : null}
                {preview ? (
                  <span className="truncate text-[10px] text-muted-foreground">{preview}</span>
                ) : null}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </span>
            </button>
          )}
        />
        <CollapsibleContent>
          <div className="flex flex-col gap-2">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

// ─── body ────────────────────────────────────────────────────────────────────

// Reads a computed value for display in field inputs without persisting it as an
// override. Returns '' for blank/auto/initial so the input stays placeholder-like.
function readComputed(el, key) {
  if (!el) return '';
  const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  const v = getComputedStyle(el).getPropertyValue(kebab);
  if (!v) return '';
  const t = v.trim();
  if (!t || t === 'auto' || t === 'normal' || t === 'none') return '';
  return t;
}

// Switch position-mode without visual jump. Reads current bounding rect and
// emits matching `left`/`top` for the new containing block:
//   • static / relative → clear all insets
//   • absolute          → relative to offsetParent (positioned ancestor)
//   • fixed             → relative to viewport
function computePositionModeSwitch(el, mode) {
  if (!el) return null;
  if (mode === 'static' || mode === 'relative') {
    return {
      position: mode === 'static' ? '' : 'relative',
      left: '',
      top: '',
      right: '',
      bottom: '',
    };
  }
  const r = el.getBoundingClientRect();
  if (mode === 'fixed') {
    return {
      position: 'fixed',
      left: `${Math.round(r.left)}px`,
      top: `${Math.round(r.top)}px`,
      right: '',
      bottom: '',
    };
  }
  if (mode === 'absolute') {
    const ancestor = el.offsetParent || document.body;
    const ar = ancestor.getBoundingClientRect();
    return {
      position: 'absolute',
      left: `${Math.round(r.left - ar.left)}px`,
      top: `${Math.round(r.top - ar.top)}px`,
      right: '',
      bottom: '',
    };
  }
  return null;
}

const POSITION_MODES = ['static', 'relative', 'absolute', 'fixed'];

function PositionRow({ el, styleOf, setStyle }) {
  const labelId = useId();
  const current = styleOf('position') || 'static';
  const mode = POSITION_MODES.includes(current) ? current : 'static';
  const applyMode = (next) => {
    if (!next || next === mode) return;
    const patch = computePositionModeSwitch(el, next);
    if (!patch) return;
    for (const [k, v] of Object.entries(patch)) setStyle(k, v);
  };
  return (
    <div className={cn(ROW_CLS, 'w-full justify-between')}>
      <span id={labelId} className="shrink-0 text-xs text-muted-foreground">
        Position
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        variant="outline"
        value={mode}
        onValueChange={applyMode}
        className="h-7"
        aria-labelledby={labelId}
      >
        {POSITION_MODES.map((m) => (
          <ToggleGroupItem
            key={m}
            value={m}
            size="sm"
            variant="outline"
            className="h-7 px-3 text-[11px] font-medium"
          >
            {m}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function EditPanelBody({ el, overrides, onApply, onClose }) {
  const ref = ensureDsRef(el);
  // Capture `overrides` via ref so init only fires on element change — not when
  // our own auto-persist updates the overrides map (which would re-init in a loop).
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // `styles` holds ONLY user-edited deltas — never the computed snapshot.
  const [styles, setStyles] = useState({});
  const [cssText, setCssText] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    const initial = overridesRef.current[ref] || {};
    setStyles(initial.styles || {});
    setCssText(initial.cssText || '');
    initialized.current = false;
    const id = requestAnimationFrame(() => {
      initialized.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [el, ref]);

  const cssError = useMemo(() => validateCssText(cssText), [cssText]);

  // Tweaks-style auto-persist: each change debounces a write to disk via onApply.
  // Text content is no longer edited from the panel — double-click the element
  // in the preview to edit it inline (selection-picker handles that flow and
  // calls applyOverride directly with { textContent }).
  useEffect(() => {
    if (!initialized.current) return;
    const t = setTimeout(() => {
      onApply(ref, {
        styles,
        cssText: cssText.trim() || undefined,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [ref, styles, cssText, onApply]);

  const setStyle = (key, value) => {
    setStyles((s) => {
      if (value === '' || value == null) {
        const { [key]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [key]: value };
    });
  };
  // Read order: in-flight user edit first, then any persisted override, then
  // computed (for display only). The displayed value is what the user sees in
  // the input; `styles` is what gets persisted.
  const styleOf = (key) => styles[key] ?? readComputed(el, key);

  const previewStyle = useLivePreview(ref, el, styles, cssText);

  const inDocFonts = useMemo(() => getDocumentFonts(), [el]);
  const { options: fontOptions, pickFont } = useFontOptions(styleOf('fontFamily'), inDocFonts);

  // `defaultOpen` per section: open when the user has any in-flight edit OR a
  // persisted override targeting that section's keys. These useMemos only seed
  // initial state — SectionCollapsible owns its own open state thereafter, so
  // user toggles aren't overwritten when `styles` updates.
  const persistedStyles = (overrides[ref] && overrides[ref].styles) || null;
  const openTypography = useMemo(
    () => hasOverrideForSection('Typography', styles, persistedStyles),
    [styles, persistedStyles],
  );
  const openSize = useMemo(
    () => hasOverrideForSection('Size', styles, persistedStyles),
    [styles, persistedStyles],
  );
  const openLayout = useMemo(
    () => hasOverrideForSection('Layout', styles, persistedStyles),
    [styles, persistedStyles],
  );
  const openPosition = useMemo(
    () => hasOverrideForSection('Position', styles, persistedStyles),
    [styles, persistedStyles],
  );
  const openBox = useMemo(
    () => hasOverrideForSection('Box', styles, persistedStyles),
    [styles, persistedStyles],
  );
  const openEffects = useMemo(
    () => hasOverrideForSection('Effects', styles, persistedStyles),
    [styles, persistedStyles],
  );

  // Section header previews — terse summaries shown when collapsed. Read via
  // styleOf so they reflect both in-flight edits and computed values; depend on
  // `styles` + `el` so they update on every edit / element change.
  const typoPreview = useMemo(() => {
    const size = styleOf('fontSize');
    const weight = styleOf('fontWeight');
    if (!size && !weight) return 'auto';
    return [size, weight].filter(Boolean).join(' · ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, el]);
  const sizePreview = useMemo(() => {
    const w = styleOf('width');
    const h = styleOf('height');
    if (!w && !h) return 'auto';
    const num = (v) => (v ? String(v).replace(/px$/, '') : 'auto');
    return `${num(w)} × ${num(h)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, el]);
  const layoutPreview = useMemo(() => {
    const display = styleOf('display') || 'block';
    if (FLEX_OR_GRID.has(display)) {
      const dir = styleOf('flexDirection');
      return dir ? `${display} · ${dir}` : display;
    }
    return display;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, el]);
  const positionPreview = useMemo(() => {
    const pos = styleOf('position');
    return pos && pos !== 'static' ? pos : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, el]);
  const boxFill = useMemo(
    () => styleOf('backgroundColor') || styleOf('background') || '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, el],
  );
  const boxPreview = useMemo(() => {
    const radius = styleOf('borderRadius');
    if (!boxFill && !radius) return '—';
    return radius ? `${radius} radius` : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxFill, styles, el]);
  const effectsPreview = useMemo(() => {
    const transform = styleOf('transform');
    const shadow = styleOf('boxShadow');
    if (transform) return transform.length > 24 ? `${transform.slice(0, 24)}…` : transform;
    if (shadow) return 'shadow';
    return '—';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles, el]);

  return (
    <>
      {previewStyle}

      {/* Scrollable body */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <SectionCollapsible title="Typography" defaultOpen={openTypography} preview={typoPreview}>
            <SelectRow
              label="Font"
              full
              value={styleOf('fontFamily')}
              options={fontOptions}
              onChange={(v) => {
                pickFont(v);
                setStyle('fontFamily', v);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumericRow
                label="Size"
                value={styleOf('fontSize')}
                onChange={(v) => setStyle('fontSize', v)}
                styleKey="fontSize"
              />
              <SelectRow
                label="Weight"
                value={styleOf('fontWeight')}
                options={WEIGHT_OPTIONS}
                onChange={(v) => setStyle('fontWeight', v)}
              />
              <ColorRow
                label="Color"
                value={styleOf('color')}
                onChange={(v) => setStyle('color', v)}
              />
              <SelectRow
                label="Align"
                value={styleOf('textAlign')}
                options={ALIGN_OPTIONS}
                onChange={(v) => setStyle('textAlign', v)}
              />
              <TextRow
                label="Line Height"
                value={styleOf('lineHeight')}
                onChange={(v) => setStyle('lineHeight', v)}
                styleKey="lineHeight"
              />
              <NumericRow
                label="Tracking"
                value={styleOf('letterSpacing')}
                onChange={(v) => setStyle('letterSpacing', v)}
                styleKey="letterSpacing"
              />
            </div>
          </SectionCollapsible>

          <SectionCollapsible title="Size" defaultOpen={openSize} preview={sizePreview}>
            <div className="grid grid-cols-2 gap-2">
              <NumericRow
                label="Width"
                value={styleOf('width')}
                onChange={(v) => setStyle('width', v)}
                styleKey="width"
              />
              <NumericRow
                label="Height"
                value={styleOf('height')}
                onChange={(v) => setStyle('height', v)}
                styleKey="height"
              />
            </div>
          </SectionCollapsible>

          <SectionCollapsible title="Layout" defaultOpen={openLayout} preview={layoutPreview}>
            <SelectRow
              label="Display"
              full
              value={styleOf('display')}
              options={DISPLAY_OPTIONS}
              onChange={(v) => setStyle('display', v)}
            />
            {FLEX_OR_GRID.has(styleOf('display')) ? (
              <div className="grid grid-cols-2 gap-2">
                <NumericRow
                  label="Gap"
                  value={styleOf('gap')}
                  onChange={(v) => setStyle('gap', v)}
                  styleKey="gap"
                />
                <SelectRow
                  label="Direction"
                  value={styleOf('flexDirection')}
                  options={DIRECTION_OPTIONS}
                  onChange={(v) => setStyle('flexDirection', v)}
                />
                <SelectRow
                  label="Justify"
                  value={styleOf('justifyContent')}
                  options={JUSTIFY_OPTIONS}
                  onChange={(v) => setStyle('justifyContent', v)}
                />
                <SelectRow
                  label="Align"
                  value={styleOf('alignItems')}
                  options={ALIGN_ITEMS_OPTIONS}
                  onChange={(v) => setStyle('alignItems', v)}
                />
              </div>
            ) : null}
          </SectionCollapsible>

          <SectionCollapsible title="Position" defaultOpen={openPosition} preview={positionPreview}>
            <PositionRow el={el} styleOf={styleOf} setStyle={setStyle} />
            {styleOf('position') === 'absolute' ||
            styleOf('position') === 'fixed' ||
            styleOf('position') === 'relative' ? (
              <div className="grid grid-cols-2 gap-2">
                <NumericRow
                  label="Left"
                  value={styleOf('left')}
                  onChange={(v) => setStyle('left', v)}
                  styleKey="left"
                />
                <NumericRow
                  label="Top"
                  value={styleOf('top')}
                  onChange={(v) => setStyle('top', v)}
                  styleKey="top"
                />
              </div>
            ) : null}
          </SectionCollapsible>

          <SectionCollapsible
            title="Box"
            defaultOpen={openBox}
            preview={boxPreview}
            swatch={boxFill || undefined}
          >
            <ColorRow
              label="Fill"
              full
              value={styleOf('backgroundColor') || styleOf('background')}
              onChange={(v) => {
                setStyle('backgroundColor', v);
                setStyle('background', '');
              }}
            />
            <OpacityRow value={styleOf('opacity')} onChange={(v) => setStyle('opacity', v)} />
            <SpacingBlock
              label="Padding"
              keyForSide={(s) => `padding${s}`}
              valueFor={styleOf}
              setStyle={setStyle}
            />
            <SpacingBlock
              label="Margin"
              keyForSide={(s) => `margin${s}`}
              valueFor={styleOf}
              setStyle={setStyle}
            />
            <SpacingBlock
              label="Border"
              keyForSide={(s) => `border${s}Width`}
              valueFor={styleOf}
              setStyle={setStyle}
            />
            <div className="grid grid-cols-2 gap-2">
              <SelectRow
                label="Style"
                value={styleOf('borderStyle')}
                options={BORDER_STYLE_OPTIONS}
                onChange={(v) => setStyle('borderStyle', v)}
              />
              <ColorRow
                label="Color"
                value={styleOf('borderColor')}
                onChange={(v) => setStyle('borderColor', v)}
              />
            </div>
            <NumericRow
              label="Border Radius"
              full
              value={styleOf('borderRadius')}
              onChange={(v) => setStyle('borderRadius', v)}
              styleKey="borderRadius"
            />
          </SectionCollapsible>

          <SectionCollapsible title="Effects" defaultOpen={openEffects} preview={effectsPreview}>
            <TextRow
              label="Shadow"
              full
              value={styleOf('boxShadow')}
              onChange={(v) => setStyle('boxShadow', v)}
              placeholder="0 1px 2px rgba(0,0,0,.1)"
            />
            <TextRow
              label="Transform"
              full
              value={styleOf('transform')}
              onChange={(v) => setStyle('transform', v)}
              placeholder="scale(1.05)"
            />
          </SectionCollapsible>

          <Collapsible>
            <CssEditor cssText={cssText} setCssText={setCssText} cssError={cssError} />
          </Collapsible>
        </div>
      </ScrollArea>
    </>
  );
}

// CSS editor — IME-safe Textarea with proper label + error message wiring.
function CssEditor({ cssText, setCssText, cssError }) {
  const id = useId();
  const errorId = `${id}-err`;
  const composingRef = useRef(false);
  return (
    <>
      <CollapsibleTrigger
        render={(props) => (
          <button type="button" {...props} className={cn(ROW_CLS, 'w-full text-left')}>
            <label htmlFor={id} className="shrink-0 cursor-default text-xs text-muted-foreground">
              Custom CSS
            </label>
            <span
              aria-hidden
              className="ml-auto truncate font-mono text-[10px] text-muted-foreground"
            >
              {cssText ? `${cssText.slice(0, 28)}…` : 'none'}
            </span>
            <ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
      />
      <CollapsibleContent>
        <Textarea
          id={id}
          value={cssText}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setCssText(e.currentTarget.value);
          }}
          onChange={(e) => {
            if (composingRef.current) return;
            setCssText(e.target.value);
          }}
          placeholder="transform: scale(1.05); …"
          rows={3}
          aria-invalid={cssError ? true : undefined}
          aria-errormessage={cssError ? errorId : undefined}
          className={cn(
            'mt-1.5 font-mono text-xs',
            cssError && 'border-destructive ring-1 ring-destructive/30',
          )}
        />
        {cssError ? (
          <p id={errorId} role="alert" className="mt-1 px-1 text-[11px] text-destructive">
            {cssError}
          </p>
        ) : null}
      </CollapsibleContent>
    </>
  );
}

// Canvas-wide controls shown when Edit mode is on but nothing is selected.
// Persists to overrides.json's `canvas` field, which OverridesInjector emits
// as a :root rule so background/font/base-size apply globally.

// Track whether the active page is a raw page (no canvas chrome). Canvas-wide
// overrides target `.design-canvas { ... }`, which raw pages don't carry, so
// the Canvas section UI is meaningless there. We detect by polling for the
// `data-dc-page-raw` marker the design-canvas sets on raw page wrappers — no
// dedicated event bus needed since page switches are infrequent.
function useIsRawPage() {
  const [raw, setRaw] = useState(() =>
    typeof document !== 'undefined' ? !!document.querySelector('[data-dc-page-raw]') : false,
  );
  useEffect(() => {
    const tick = () => setRaw(!!document.querySelector('[data-dc-page-raw]'));
    tick();
    const obs = new MutationObserver(tick);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => obs.disconnect();
  }, []);
  return raw;
}

function CanvasPanelBody({ canvasStyles, onApplyCanvas }) {
  const [draft, setDraft] = useState(canvasStyles || {});
  const inDocFonts = useMemo(() => getDocumentFonts(), []);
  const { options: canvasFontOptions, pickFont } = useFontOptions(draft.fontFamily, inDocFonts);
  const isRawPage = useIsRawPage();

  useEffect(() => {
    setDraft(canvasStyles || {});
  }, [canvasStyles]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return undefined;
    }
    const t = setTimeout(() => {
      onApplyCanvas(draft);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, onApplyCanvas]);

  const set = (key, value) => {
    setDraft((d) => {
      const next = { ...d };
      if (value === '' || value == null) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  if (isRawPage) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          <SectionLabel>Canvas</SectionLabel>
          <p className="px-1 text-[12px] leading-snug text-muted-foreground">
            This page is rendered raw (no canvas chrome), so canvas-wide background/font/text-color
            controls don&apos;t apply here. Click an element in the preview to edit it directly, or
            switch to a canvas page to adjust canvas settings.
          </p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-4">
        <section className="flex flex-col gap-2">
          <SectionLabel>Canvas</SectionLabel>
          <p className="px-1 text-[11px] leading-snug text-muted-foreground">
            Click an element in the preview to edit it directly. These controls apply to the whole
            canvas (every artboard inherits unless overridden).
          </p>
          <ColorRow
            label="Background"
            full
            value={draft.backgroundColor}
            onChange={(v) => set('backgroundColor', v)}
          />
          <SelectRow
            label="Font"
            full
            value={draft.fontFamily}
            options={canvasFontOptions}
            onChange={(v) => {
              pickFont(v);
              set('fontFamily', v);
            }}
          />
          <NumericRow
            label="Base size"
            full
            value={draft.fontSize}
            onChange={(v) => set('fontSize', v)}
            styleKey="fontSize"
          />
          <ColorRow label="Text color" full value={draft.color} onChange={(v) => set('color', v)} />
        </section>
      </div>
    </ScrollArea>
  );
}

export function EditPanel({
  open,
  el,
  overrides,
  canvasStyles,
  onApply,
  onApplyCanvas,
  onClearSelection,
  onClose,
}) {
  // Sheet stays open as long as Edit mode is on. Closing fires ONLY when the
  // user clicks the X (closePress) or the host toggles Edit off
  // (imperativeAction). Base UI's Dialog would otherwise auto-close on
  // outsidePress / escapeKey / focusOut — the last one fires when the user
  // double-clicks an element to start inline text editing (focus moves to
  // the contentEditable outside the panel), so we filter those out.
  return (
    <Sheet
      open={!!open}
      onOpenChange={(o, details) => {
        if (o) return;
        const reason = details?.reason;
        if (reason === 'closePress' || reason === 'imperativeAction') onClose();
      }}
      modal={false}
      disablePointerDismissal
    >
      <SheetContent
        side="right"
        showOverlay={false}
        showCloseButton={false}
        className="ds-review-ui flex w-[340px] flex-col gap-0 p-0 sm:w-[360px]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              {el ? 'Edit element' : 'Edit canvas'}
            </h2>
            {el && (
              <div
                role="status"
                aria-live="polite"
                className="truncate font-mono text-[11px] text-muted-foreground"
              >
                {describeElForHeader(el)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {el && (
              <button
                type="button"
                onClick={onClearSelection}
                title="Back to canvas settings"
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Canvas
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit panel"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {el ? (
          <EditPanelBody el={el} overrides={overrides} onApply={onApply} onClose={onClose} />
        ) : (
          <CanvasPanelBody canvasStyles={canvasStyles} onApplyCanvas={onApplyCanvas} />
        )}
      </SheetContent>
    </Sheet>
  );
}
