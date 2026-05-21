import { useEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';

import { stylesToCssRule } from './css-property-schema.js';
import { ensureDsRef } from './elementContext.js';

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
  const parts = flat.split(';').map((p) => p.trim()).filter(Boolean);
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
  'flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm';
const ROW_INVALID_CLS = 'border-destructive ring-1 ring-destructive/30';

function FieldShell({ label, children, className, invalid = false }) {
  return (
    <div
      className={cn(ROW_CLS, invalid && ROW_INVALID_CLS, className)}
      data-invalid={invalid || undefined}
    >
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function FieldInput({ value, onChange, invalid = false, ...props }) {
  return (
    <input
      {...props}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-w-0 flex-1 border-0 bg-transparent text-right text-sm text-foreground outline-none',
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
  const valid =
    !styleKey || draftNum === '' ? true : validateStyleValue(styleKey, joined);
  const invalid = valid !== true;

  const handleChange = (v) => {
    setDraftNum(v);
    const next = joinUnit(v, u || unit);
    if (v === '' || !styleKey || validateStyleValue(styleKey, next) === true) {
      onChange(next);
    }
  };

  return (
    <FieldShell label={label} className={full ? 'w-full' : undefined} invalid={invalid}>
      <FieldInput
        value={draftNum}
        onChange={handleChange}
        inputMode="decimal"
        invalid={invalid}
      />
      <span className="shrink-0 text-xs text-muted-foreground">{u || unit}</span>
    </FieldShell>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
  full = false,
  mono = false,
  styleKey,
}) {
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
    <FieldShell label={label} className={full ? 'w-full' : undefined} invalid={invalid}>
      <FieldInput
        value={draft}
        placeholder={placeholder}
        onChange={handleChange}
        className={mono ? 'font-mono text-xs' : undefined}
        invalid={invalid}
      />
    </FieldShell>
  );
}

function SelectRow({ label, value, options, onChange, full = false }) {
  const opts = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  return (
    <FieldShell label={label} className={cn('relative', full && 'w-full')}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent pr-4 text-right text-sm text-foreground outline-none"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-3 text-muted-foreground"
      />
    </FieldShell>
  );
}

function ColorRow({ label, value, onChange, full = false }) {
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

  const handlePicker = (v) => {
    setDraft(v);
    onChange(v);
  };

  return (
    <FieldShell label={label} className={full ? 'w-full' : undefined} invalid={invalid}>
      <Popover>
        <PopoverTrigger
          render={(props) => (
            <button
              type="button"
              {...props}
              className="size-4 shrink-0 rounded border border-border"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
              }}
              aria-label="Pick color"
            >
              <span className="block size-full rounded-[3px]" style={{ background: swatch }} />
            </button>
          )}
        />
        <PopoverContent align="end" className="w-auto p-3">
          <HexAlphaColorPicker color={hex} onChange={handlePicker} />
        </PopoverContent>
      </Popover>
      <FieldInput
        value={draft}
        onChange={handleInput}
        placeholder="auto"
        className="font-mono text-xs"
        invalid={invalid}
      />
    </FieldShell>
  );
}

function OpacityRow({ value, onChange }) {
  const pct = opacityPercent(value);
  return (
    <FieldShell label="Opacity" className="w-full">
      <Slider
        value={[pct]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(String(Math.min(1, Math.max(0, v / 100))))}
        className="min-w-0 flex-1"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">{pct}</span>
      <span className="shrink-0 text-xs text-muted-foreground">%</span>
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

const FONT_OPTIONS = [
  '-apple-system',
  'ui-sans-serif, system-ui, sans-serif',
  'Georgia, "Times New Roman", serif',
  'ui-monospace, monospace',
];
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

function EditPanelBody({ el, overrides, onApply, onClose }) {
  const ref = ensureDsRef(el);
  // Capture `overrides` via ref so init only fires on element change — not when
  // our own auto-persist updates the overrides map (which would re-init in a loop).
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // `styles` holds ONLY user-edited deltas — never the computed snapshot.
  const [styles, setStyles] = useState({});
  const [cssText, setCssText] = useState('');
  const [text, setText] = useState('');
  const initialTextRef = useRef('');
  const initialized = useRef(false);

  useEffect(() => {
    const initial = overridesRef.current[ref] || {};
    const initialText = (el.textContent || '').trim().slice(0, 500);
    initialTextRef.current = initialText;
    setText(initialText);
    setStyles(initial.styles || {});
    setCssText(initial.cssText || '');
    initialized.current = false;
    const id = requestAnimationFrame(() => {
      initialized.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [el, ref]);

  const textChanged = text !== initialTextRef.current;
  const cssError = useMemo(() => validateCssText(cssText), [cssText]);

  // No auto-persist. The user must explicitly Apply or Cancel — the live
  // preview <style> tag shows changes immediately but nothing hits disk until
  // they confirm. Cancel discards local state; closing the Sheet without
  // Apply/Cancel is intentionally disabled (locked panel).
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

  const previewStyle = useLivePreview(ref, el, styles, cssText, text);

  const fontOptions = useMemo(() => {
    const current = styleOf('fontFamily');
    if (current && !FONT_OPTIONS.includes(current)) return [current, ...FONT_OPTIONS];
    return FONT_OPTIONS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles.fontFamily, el]);

  const apply = () => {
    onApply(ref, {
      styles,
      cssText: cssText.trim() || undefined,
      textContent: textChanged ? text : undefined,
    });
  };

  const cancel = () => {
    // Discard any in-flight edits — the live-preview style tag and any text
    // mutation are both keyed off the EditPanel mount, so closing reverts them.
    onClose();
  };

  const hasChanges =
    Object.keys(styles).length > 0 ||
    cssText.trim() !== '' ||
    textChanged;

  return (
    <>
      {previewStyle}

      {/* Header — no close button: panel is locked until Apply or Cancel. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Edit</h2>
        {hasChanges && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Unsaved
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <section className="flex flex-col gap-2">
            <SectionLabel>Typography</SectionLabel>
            <SelectRow
              label="Font"
              full
              value={styleOf('fontFamily')}
              options={fontOptions}
              onChange={(v) => setStyle('fontFamily', v)}
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
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Size</SectionLabel>
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
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Layout</SectionLabel>
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
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Box</SectionLabel>
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
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>Effects</SectionLabel>
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
          </section>

          <Collapsible>
            <CollapsibleTrigger
              render={(props) => (
                <button type="button" {...props} className={cn(ROW_CLS, 'w-full text-left')}>
                  <span className="shrink-0 text-xs text-muted-foreground">Text content</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {text ? `"${text.slice(0, 24)}${text.length > 24 ? '…' : ''}"` : 'empty'}
                  </span>
                  <ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                </button>
              )}
            />
            <CollapsibleContent>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Text content"
                rows={3}
                className="mt-1.5"
              />
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger
              render={(props) => (
                <button type="button" {...props} className={cn(ROW_CLS, 'w-full text-left')}>
                  <span className="shrink-0 text-xs text-muted-foreground">Custom CSS</span>
                  <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                    {cssText ? `${cssText.slice(0, 28)}…` : 'none'}
                  </span>
                  <ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                </button>
              )}
            />
            <CollapsibleContent>
              <Textarea
                value={cssText}
                onChange={(e) => setCssText(e.target.value)}
                placeholder="transform: scale(1.05); …"
                rows={3}
                aria-invalid={cssError ? true : undefined}
                className={cn(
                  'mt-1.5 font-mono text-xs',
                  cssError && 'border-destructive ring-1 ring-destructive/30',
                )}
              />
              {cssError ? (
                <p className="mt-1 px-1 text-[11px] text-destructive">{cssError}</p>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Footer — explicit commit/discard, no auto-close. */}
      <div className="flex gap-2 border-t border-border bg-background px-4 py-3">
        <Button variant="secondary" onClick={cancel} className="flex-1">
          Cancel
        </Button>
        <Button onClick={apply} className="flex-1" disabled={!hasChanges || !!cssError}>
          Apply
        </Button>
      </div>
    </>
  );
}

export function EditPanel({ el, overrides, onApply, onClose }) {
  const open = !!el;
  // Locked Sheet: outside clicks and Escape are swallowed. Closing only happens
  // when the body's Apply / Cancel buttons explicitly call onClose.
  return (
    <Sheet open={open} onOpenChange={() => {}} modal={false}>
      <SheetContent
        side="right"
        showOverlay={false}
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault?.()}
        onPointerDownOutside={(e) => e.preventDefault?.()}
        onInteractOutside={(e) => e.preventDefault?.()}
        className="ds-review-ui flex w-[340px] flex-col gap-0 p-0 sm:w-[360px]"
      >
        {el ? (
          <EditPanelBody el={el} overrides={overrides} onApply={onApply} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
