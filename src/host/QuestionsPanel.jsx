import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { buildAgentFeedbackMarkdown } from '../../lib/comment-utils.mjs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const IDLE_MS = 5 * 60 * 1000;

async function writeJson(path, data) {
  await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content: JSON.stringify(data, null, 2) + '\n' }),
  });
}

async function writeUpload(designName, questionId, file) {
  const ext = file.name.split('.').pop() || 'bin';
  const rel = `designs/${designName}/uploads/${questionId}-${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: rel, content: btoa(binary), encoding: 'base64' }),
  });
  return rel.replace(`designs/${designName}/`, '');
}

/** Map legacy `type` + `prompt` to Claude Design `kind` + `title`. */
export function normalizeQuestion(q) {
  if (!q || !q.id) return null;
  const title = q.title || q.prompt || q.id;
  const options = Array.isArray(q.options) ? q.options : [];

  if (q.kind) {
    return { ...q, title, options };
  }
  if (q.type === 'text') {
    return { ...q, kind: 'freeform', title, options };
  }
  if (q.type === 'multi') {
    return { ...q, kind: 'text-options', multi: true, title, options };
  }
  if (q.type === 'single') {
    return { ...q, kind: 'text-options', multi: false, title, options };
  }
  return { ...q, kind: 'text-options', title, options };
}

function normalizeSpec(data) {
  const raw = Array.isArray(data?.questions) ? data.questions : [];
  const questions = raw.map(normalizeQuestion).filter((q) => q?.id && q?.kind && q?.title);
  return { ...data, questions };
}

function isAllOfTheAbove(label) {
  return /^all of the above\b/i.test(label);
}

/**
 * Renders text option questions using shadcn primitives.
 *
 * - `q.multi` false → RadioGroup (single string answer)
 * - `q.multi` true  → list of Checkboxes (array answer)
 *
 * In both cases an "Other…" textarea allows entering a free-form option;
 * its value is stored alongside the canonical options in `value`.
 */
function TextOptionsControl({ q, value, onChange }) {
  const selected = new Set(
    Array.isArray(value) ? value.map(String) : value != null && value !== '' ? [String(value)] : [],
  );
  const knownOptions = q.options ?? [];
  // Discover any custom "other" value that isn't in the option list.
  const initialOther = (() => {
    if (Array.isArray(value)) {
      const extra = value.find((v) => !knownOptions.includes(v));
      return extra ?? '';
    }
    if (typeof value === 'string' && value && !knownOptions.includes(value)) {
      return value;
    }
    return '';
  })();
  const [other, setOther] = useState(initialOther);

  const toggleMulti = (opt, checked) => {
    const next = new Set(selected);
    if (!checked) {
      next.delete(opt);
    } else {
      for (const o of knownOptions) {
        if (isAllOfTheAbove(opt) !== isAllOfTheAbove(o)) next.delete(o);
      }
      next.add(opt);
    }
    onChange([...next]);
  };

  if (q.multi) {
    return (
      <FieldGroup data-slot="checkbox-group" className="gap-2.5">
        {knownOptions.map((opt) => {
          const id = `${q.id}-${opt}`;
          return (
            <Field key={opt} orientation="horizontal">
              <Checkbox
                id={id}
                checked={selected.has(opt)}
                onCheckedChange={(checked) => toggleMulti(opt, !!checked)}
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {opt}
              </FieldLabel>
            </Field>
          );
        })}
        <Field orientation="horizontal" className="items-start">
          <Checkbox
            id={`${q.id}-other`}
            checked={!!other && selected.has(other)}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (other) {
                if (checked) next.add(other);
                else next.delete(other);
              }
              onChange([...next]);
            }}
            disabled={!other}
            className="mt-1.5"
          />
          <FieldLabel htmlFor={`${q.id}-other-text`} className="sr-only">
            Other option
          </FieldLabel>
          <Textarea
            id={`${q.id}-other-text`}
            placeholder="Other…"
            value={other}
            rows={1}
            className="min-h-9 flex-1"
            onChange={(e) => {
              const T = e.target.value.replace(/\n/g, '');
              const next = new Set(selected);
              if (other && !knownOptions.includes(other)) next.delete(other);
              if (T) next.add(T);
              onChange([...next]);
              setOther(T);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
            }}
          />
        </Field>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      <RadioGroup
        value={typeof value === 'string' ? value : ''}
        onValueChange={(v) => onChange(v)}
        className="gap-2.5"
      >
        {knownOptions.map((opt) => {
          const id = `${q.id}-${opt}`;
          return (
            <Field key={opt} orientation="horizontal">
              <RadioGroupItem id={id} value={opt} />
              <FieldLabel htmlFor={id} className="font-normal">
                {opt}
              </FieldLabel>
            </Field>
          );
        })}
      </RadioGroup>
      <Field orientation="horizontal" className="items-start">
        <RadioGroup
          value={typeof value === 'string' && value === other && other ? other : ''}
          onValueChange={() => other && onChange(other)}
          className="contents"
        >
          <RadioGroupItem
            id={`${q.id}-other`}
            value={other || '__other__'}
            disabled={!other}
            className="mt-1.5"
          />
        </RadioGroup>
        <FieldLabel htmlFor={`${q.id}-other-text`} className="sr-only">
          Other option
        </FieldLabel>
        <Textarea
          id={`${q.id}-other-text`}
          placeholder="Other…"
          value={other}
          rows={1}
          className="min-h-9 flex-1"
          onChange={(e) => {
            const T = e.target.value.replace(/\n/g, '');
            setOther(T);
            if (T) onChange(T);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
          }}
        />
      </Field>
    </FieldGroup>
  );
}

function SvgOptionsControl({ q, value, onChange }) {
  const selected = new Set(
    Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [],
  );
  const options = (q.options ?? []).map((svg, i) => ({ svg, index: i }));
  const optionLabels = q.optionLabels ?? [];

  const toggle = (index) => {
    const key = String(index);
    if (q.multi) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onChange([...next]);
    } else {
      onChange(key);
    }
  };

  return (
    <div
      className="flex flex-wrap gap-2"
      role={q.multi ? 'group' : 'radiogroup'}
      aria-label={q.title}
    >
      {options.map(({ svg, index }) => {
        const isSelected = selected.has(String(index));
        const accessibleName = optionLabels[index] || `Option ${index + 1}`;
        return (
          <button
            key={index}
            type="button"
            role={q.multi ? undefined : 'radio'}
            aria-checked={q.multi ? undefined : isSelected}
            aria-pressed={q.multi ? isSelected : undefined}
            aria-label={accessibleName}
            onClick={() => toggle(index)}
            className={cn(
              'flex h-[72px] w-24 items-center justify-center overflow-hidden rounded-md border p-1.5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-input bg-background hover:bg-muted',
            )}
          >
            <span
              aria-hidden
              className="flex max-h-full max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </button>
        );
      })}
    </div>
  );
}

function SliderControl({ q, value, onChange, ariaLabelledBy }) {
  const min = q.min ?? 0;
  const max = q.max ?? 100;
  const step = q.step ?? 1;
  const num = typeof value === 'number' ? value : (q.default ?? min);
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span aria-hidden>{min}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[num]}
        onValueChange={(vals) => onChange(Number(vals[0]))}
        className="flex-1"
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={`${num} (min ${min}, max ${max})`}
      />
      <span aria-hidden>{max}</span>
      <strong aria-hidden className="min-w-10 text-right text-foreground">
        {num}
      </strong>
    </div>
  );
}

function FileControl({ q, value, onChange, designName }) {
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await writeUpload(designName, q.id, file);
      onChange(path);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label
      className={cn(
        'block cursor-pointer rounded-lg border-2 border-dashed bg-background p-5 text-center text-xs text-muted-foreground transition-colors',
        value ? 'border-primary text-foreground' : 'border-border hover:border-foreground/30',
      )}
    >
      <input type="file" accept={q.accept} onChange={onFile} className="hidden" />
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <Spinner /> Uploading…
        </span>
      ) : value ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-4" aria-hidden />
          {value}
        </span>
      ) : (
        'Click to upload a file'
      )}
    </label>
  );
}

function FreeformControl({ value, onChange }) {
  return (
    <Textarea
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Your answer…"
      rows={4}
    />
  );
}

function QuestionField({ q, value, onChange, designName, labelId }) {
  switch (q.kind) {
    case 'text-options':
      return <TextOptionsControl q={q} value={value} onChange={onChange} />;
    case 'svg-options':
      return <SvgOptionsControl q={q} value={value} onChange={onChange} />;
    case 'slider':
      return (
        <SliderControl q={q} value={value} onChange={onChange} ariaLabelledBy={labelId} />
      );
    case 'file':
      return <FileControl q={q} value={value} onChange={onChange} designName={designName} />;
    case 'freeform':
      return <FreeformControl value={value} onChange={onChange} />;
    default:
      return null;
  }
}

export default function QuestionsPanel({ designName, onAnswered, onDismiss }) {
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const onTimeoutRef = useRef(() => {});

  const load = useCallback(async () => {
    if (!designName) return;
    try {
      const res = await fetch(`/designs/${designName}/questions.json`);
      if (!res.ok) {
        setData(null);
        return;
      }
      const q = await res.json();
      setData(normalizeSpec(q));
      setAnswers(q.answers || {});
    } catch {
      setData(null);
    }
  }, [designName]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const shouldShow = data?.status === 'pending' && data?.trigger === 'open';

  useEffect(() => {
    if (!shouldShow) return undefined;
    let timer = setTimeout(() => onTimeoutRef.current?.(), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onTimeoutRef.current?.(), IDLE_MS);
    };
    // pointerdown covers mouse + touch + pen; touchstart is a belt-and-braces
    // for older iOS Safari where pointer events on the document don't fire.
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [shouldShow]);

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const dismiss = useCallback(async () => {
    if (!designName || !data) return;
    const next = { ...data, trigger: null };
    await writeJson(`designs/${designName}/questions.json`, next);
    setData(next);
    onDismiss?.();
  }, [designName, data, onDismiss]);

  useEffect(() => {
    onTimeoutRef.current = dismiss;
  }, [dismiss]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const next = {
        ...data,
        status: 'answered',
        trigger: null,
        answeredAt: new Date().toISOString(),
        answers,
      };
      await writeJson(`designs/${designName}/questions.json`, next);
      const md = buildAgentFeedbackMarkdown(designName, [], next);
      await fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `designs/${designName}/agent-feedback.md`,
          content: md,
        }),
      });
      await fetch('/api/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `designs/${designName}/events.jsonl`,
          line: `${JSON.stringify({
            at: next.answeredAt,
            type: 'questions.answered',
            design: designName,
            answers: next.answers,
          })}\n`,
        }),
      }).catch(() => {});
      setData(next);
      onAnswered?.(next);
    } finally {
      setSubmitting(false);
    }
  };

  if (!shouldShow) return null;

  const spec = normalizeSpec(data);

  return (
    <Dialog open={shouldShow} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        className="ds-review-ui flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden gap-0 p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="font-heading text-xl font-normal">
            {spec.title || 'Quick questions'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <FieldGroup className="gap-7">
            {spec.questions.map((q) => {
              const labelId = `q-${q.id}-label`;
              return (
                <Field key={q.id}>
                  <FieldLabel id={labelId} className="text-sm font-semibold">
                    {q.title}
                  </FieldLabel>
                  {q.subtitle && (
                    <FieldDescription className="!mt-0 -mb-1">{q.subtitle}</FieldDescription>
                  )}
                  <QuestionField
                    q={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswer(q.id, v)}
                    designName={designName}
                    labelId={labelId}
                  />
                </Field>
              );
            })}
          </FieldGroup>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t bg-muted/50 px-4 py-3 sm:justify-end">
          <Button variant="ghost" onClick={dismiss} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? 'Continuing…' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
