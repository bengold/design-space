import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { colord } from 'colord';
import { ChevronDown, X } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// Tweaks panel — original Claude-style floating panel.
//
// Each page calls `useDesignTweaks(designName, config)` to register its
// controls with a module-level singleton; the single <TweaksPanelRoot>
// mounted at preview root subscribes to the singleton and renders whichever
// page is active. Only one page mounts at a time, so the panel never
// duplicates.
//
// Config schema (mirrors the prior DialKit shape so page code can stay):
//   number              → numeric row (arrow keys ±1, Shift=10, Alt=0.1)
//   [n, min, max, step] → slider row
//   boolean             → toggle row
//   string (#hex)       → color row
//   string (other)      → text row
//   { type: 'color', default }
//   { type: 'select', options: ['a',{label,value}], default }
//   { type: 'text', default }
//   plain object        → nested folder (collapsible section)

// ─── Schema helpers ──────────────────────────────────────────────────────────

function isSliderTuple(v) {
  return Array.isArray(v) && v.length > 0 && v.length <= 4 && typeof v[0] === 'number';
}
function isTagged(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && typeof v.type === 'string';
}
function isFolder(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && typeof v.type !== 'string';
}
function isHex(v) {
  return typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v.trim());
}

function extractDefaults(config) {
  const out = {};
  for (const [key, raw] of Object.entries(config)) {
    if (isSliderTuple(raw)) out[key] = raw[0];
    else if (typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'string') out[key] = raw;
    else if (isTagged(raw)) {
      if (raw.type === 'color') out[key] = raw.default ?? '#000000';
      else if (raw.type === 'text') out[key] = raw.default ?? '';
      else if (raw.type === 'select') {
        const first = raw.options?.[0];
        out[key] = raw.default ?? (typeof first === 'string' ? first : first?.value);
      }
    } else if (isFolder(raw)) {
      out[key] = extractDefaults(raw);
    }
  }
  return out;
}

// ─── Module singleton ────────────────────────────────────────────────────────
// Publication = currently-active page's { config, values, setKey }. There can
// be at most one publication at a time. Subscribers (the panel root) re-render
// when it changes.
const pub = { current: null, listeners: new Set() };

function publishPublication(next) {
  pub.current = next;
  pub.listeners.forEach((l) => l());
}

function usePublication() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    pub.listeners.add(l);
    return () => pub.listeners.delete(l);
  }, []);
  return pub.current;
}

// ─── Public hook ─────────────────────────────────────────────────────────────

export function useDesignTweaks(designName, config) {
  const [values, setValues] = useState(() => extractDefaults(config));
  const loaded = useRef(false);

  // Load: defaults from tweaks.defaults.json + saved tweaks.json + localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { loadTweakValues, loadTweaksFromLocalStorage } = await import(
          '../preview/tweakStorage.js'
        );
        const fromDisk = await loadTweakValues(designName, extractDefaults(config));
        const withLocal = loadTweaksFromLocalStorage(designName, fromDisk);
        if (!cancelled) {
          setValues((prev) => ({ ...prev, ...withLocal }));
          loaded.current = true;
        }
      } catch {
        if (!cancelled) loaded.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // designName + serialized config — config edits during dev should reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designName]);

  const setKey = useCallback(
    (key, value) => {
      setValues((prev) => {
        if (Object.is(prev[key], value)) return prev;
        const edits = { [key]: value };
        if (typeof window !== 'undefined') {
          if (window.parent) window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
          window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
        }
        import('../preview/tweakStorage.js').then(({ persistTweakEdits }) =>
          persistTweakEdits(designName, edits),
        );
        return { ...prev, [key]: value };
      });
    },
    [designName],
  );

  // Publish to the singleton on every render — the panel reads the latest
  // values directly. Cleanup on unmount clears the publication so the panel
  // hides until the next page mounts.
  useEffect(() => {
    publishPublication({ config, values, setKey });
    return () => {
      if (pub.current?.setKey === setKey) publishPublication(null);
    };
  }, [config, values, setKey]);

  return values;
}

// ─── Field components ────────────────────────────────────────────────────────

const ROW =
  'flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring';
const INPUT =
  'min-w-0 flex-1 border-0 bg-transparent text-right text-[12px] text-foreground outline-none focus-visible:outline-none';

function FieldShell({ inputId, label, children, className }) {
  return (
    <div className={cn(ROW, className)}>
      <label
        htmlFor={inputId}
        className="shrink-0 cursor-default text-[11px] text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function NumberRow({ label, value, onChange, min, max, step = 1 }) {
  const id = useId();
  return (
    <FieldShell inputId={id} label={label}>
      <input
        id={id}
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const m = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          const next = (typeof value === 'number' ? value : 0) + dir * step * m;
          const rounded = Math.round(next * 10000) / 10000;
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
          onChange(clamped);
        }}
        aria-keyshortcuts="ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Alt+ArrowUp Alt+ArrowDown"
        className={cn(
          INPUT,
          '[appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden',
        )}
      />
    </FieldShell>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange }) {
  const id = useId();
  return (
    <FieldShell inputId={id} label={label}>
      <Slider
        id={id}
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        className="min-w-0 flex-1"
      />
      <span
        aria-hidden
        className="w-10 shrink-0 text-right text-[11px] tabular-nums text-foreground"
      >
        {Number.isFinite(value) ? value : '—'}
      </span>
    </FieldShell>
  );
}

function ToggleRow({ label, value, onChange }) {
  const id = useId();
  return (
    <FieldShell inputId={id} label={label}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          'ml-auto inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          value ? 'bg-foreground' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block size-3 rounded-full bg-background shadow transition-transform',
            value ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </FieldShell>
  );
}

function TextRow({ label, value, onChange }) {
  const id = useId();
  return (
    <FieldShell inputId={id} label={label}>
      <input
        id={id}
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </FieldShell>
  );
}

function SelectRow({ label, value, options, onChange }) {
  const id = useId();
  const opts = (options || []).map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  return (
    <FieldShell inputId={id} label={label} className="relative">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT, 'cursor-pointer appearance-none pr-4')}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-3 text-muted-foreground"
      />
    </FieldShell>
  );
}

function ColorRow({ label, value, onChange }) {
  const id = useId();
  const hex = value && colord(value).isValid() ? colord(value).toHex() : '#000000';
  return (
    <FieldShell inputId={id} label={label}>
      <Popover>
        <PopoverTrigger
          render={(props) => (
            <button
              type="button"
              {...props}
              aria-label={`${label}: pick color`}
              className={cn(
                'size-4 shrink-0 rounded border border-border',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
              }}
            >
              <span className="block size-full rounded-[3px]" style={{ background: hex }} />
            </button>
          )}
        />
        <PopoverContent align="end" className="w-auto p-3" aria-label={`${label} color picker`}>
          <HexAlphaColorPicker color={hex} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <input
        id={id}
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT, 'font-mono text-[11px]')}
      />
    </FieldShell>
  );
}

// ─── Folder + control resolution ─────────────────────────────────────────────

function renderControl(key, schema, value, setKey, label) {
  const onChange = (next) => setKey(key, next);
  const lbl = label || key;
  if (isSliderTuple(schema)) {
    const [, min, max, step] = schema;
    if (typeof min === 'number' && typeof max === 'number') {
      return (
        <SliderRow
          key={key}
          label={lbl}
          value={value ?? schema[0]}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={onChange}
        />
      );
    }
    return <NumberRow key={key} label={lbl} value={value ?? schema[0]} step={step ?? 1} onChange={onChange} />;
  }
  if (typeof schema === 'number') {
    return <NumberRow key={key} label={lbl} value={value ?? schema} onChange={onChange} />;
  }
  if (typeof schema === 'boolean') {
    return <ToggleRow key={key} label={lbl} value={value ?? schema} onChange={onChange} />;
  }
  if (typeof schema === 'string') {
    if (isHex(schema)) return <ColorRow key={key} label={lbl} value={value ?? schema} onChange={onChange} />;
    return <TextRow key={key} label={lbl} value={value ?? schema} onChange={onChange} />;
  }
  if (isTagged(schema)) {
    if (schema.type === 'color')
      return <ColorRow key={key} label={lbl} value={value ?? schema.default} onChange={onChange} />;
    if (schema.type === 'select')
      return (
        <SelectRow
          key={key}
          label={lbl}
          value={value ?? schema.default}
          options={schema.options}
          onChange={onChange}
        />
      );
    if (schema.type === 'text')
      return <TextRow key={key} label={lbl} value={value ?? schema.default} onChange={onChange} />;
  }
  if (isFolder(schema)) {
    return (
      <Folder key={key} title={key}>
        {Object.entries(schema).map(([k, s]) =>
          renderControl(
            k,
            s,
            value?.[k],
            (subKey, val) => setKey(key, { ...(value || {}), [subKey]: val }),
            k,
          ),
        )}
      </Folder>
    );
  }
  return null;
}

function Folder({ title, children }) {
  const [open, setOpen] = useState(true);
  const regionId = useId();
  return (
    <section className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex items-center gap-1 rounded-sm text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {/*
          Disclosure chevron — open ▼ rotates to closed ▶ ("expand into").
          ChevronDown is ⌄ pointing south; CSS -rotate-90 spins it
          counter-clockwise so the tip lands east (▶). rotate-90 would
          point west (◀), reading as "back" — avoid.
        */}
        <ChevronDown
          aria-hidden
          className={cn('size-3 transition-transform', open ? 'rotate-0' : '-rotate-90')}
        />
        {title}
      </button>
      {open && (
        <div id={regionId} className="flex flex-col gap-1.5 pl-1">
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Floating panel root ─────────────────────────────────────────────────────

export function TweaksPanelRoot({ position = 'bottom-right' }) {
  const registration = usePublication();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const titleId = useId();
  // Capture the host-toolbar element that had focus when the panel was
  // activated, so Escape (or close-button) can restore focus to it rather
  // than dropping to <body>. Same pattern as CommentPopover in
  // design-review.jsx. Lives in window.parent (the host frame) since
  // activation arrives via postMessage from the toolbar trigger.
  const triggerRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    if (window.parent) window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
    // Restore focus to the toolbar trigger. The element lives in the host
    // frame; we postMessage and let the host re-focus it (cross-frame
    // .focus() works in same-origin dev but the host owns its own a11y).
    const t = triggerRef.current;
    triggerRef.current = null;
    if (t && typeof t.focus === 'function') {
      try {
        t.focus();
      } catch {
        // Cross-frame focus may throw — host listens for the dismissed
        // message above and can re-focus its own trigger as a fallback.
      }
    }
  }, []);

  // Listen for host's edit-mode toggle (toolbar Tweaks button).
  useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') {
        // Snapshot whatever has focus right now (typically the toolbar
        // Tweaks button that the user just clicked) BEFORE the panel
        // mounts and steals focus.
        if (!triggerRef.current && typeof document !== 'undefined') {
          triggerRef.current = document.activeElement;
        }
        setActive(true);
        setOpen(true);
      } else if (t === '__deactivate_edit_mode') {
        setActive(false);
        setOpen(false);
        const prev = triggerRef.current;
        triggerRef.current = null;
        if (prev && typeof prev.focus === 'function') {
          try {
            prev.focus();
          } catch {
            // ignore cross-frame focus errors
          }
        }
      }
    };
    window.addEventListener('message', onMsg);
    if (window.parent) window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!active || !open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const target = e.target;
        // Don't swallow Escape when focus is inside a nested popover (color picker).
        if (target instanceof Element && target.closest('[data-radix-popper-content-wrapper], [data-floating-ui-portal]')) {
          return;
        }
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, open, close]);

  if (!active || !open || !registration) return null;

  const corner = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  }[position];

  const { config, values, setKey } = registration;

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      className={cn(
        'fixed z-[9990] w-[260px] rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm',
        corner,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h2
          id={titleId}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Tweaks
        </h2>
        <button
          type="button"
          aria-label="Close tweaks panel"
          onClick={close}
          className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <X className="size-3" />
        </button>
      </div>
      {/* Bottom padding leaves breathing room below the last control so it
          doesn't sit flush against the rounded corner. */}
      <div className="max-h-[70vh] overflow-auto px-3 pt-3 pb-4">
        <div className="flex flex-col gap-1.5">
          {Object.entries(config).map(([key, schema]) =>
            renderControl(key, schema, values[key], setKey, key),
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Legacy shims ────────────────────────────────────────────────────────────
// Kept as no-ops so old designs keep loading even if they import the old API.
const Deprecated = () => null;
export const TweaksPanel = Deprecated;
export const TweakSection = Deprecated;
export const TweakRow = Deprecated;
export const TweakSlider = Deprecated;
export const TweakToggle = Deprecated;
export const TweakRadio = Deprecated;
export const TweakSelect = Deprecated;
export const TweakText = Deprecated;
export const TweakNumber = Deprecated;
export const TweakColor = Deprecated;
export const TweakButton = Deprecated;
export const useTweaks = (defaults) => [defaults, () => {}];
