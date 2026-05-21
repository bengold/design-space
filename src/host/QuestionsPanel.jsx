import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { buildAgentFeedbackMarkdown } from '../../lib/comment-utils.mjs';

const IDLE_MS = 5 * 60 * 1000;

const theme = {
  bg: '#faf9f5',
  surface: '#ffffff',
  text: '#1a1915',
  textSecondary: '#4a4843',
  textTertiary: '#6b6860',
  border: 'rgba(0,0,0,.12)',
  borderSubtle: 'rgba(0,0,0,.08)',
  accent: '#D97757',
};

const shell = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  background: theme.bg,
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: theme.text,
};

const scroll = { flex: 1, overflowY: 'auto', padding: 32 };
const inner = { maxWidth: 560, margin: '0 auto' };
const titleStyle = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 22,
  fontWeight: 400,
  margin: '0 0 24px',
};
const block = { marginBottom: 28 };
const qTitle = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
const qSubtitle = { fontSize: 12, color: theme.textTertiary, marginBottom: 10 };
const chipRow = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const footer = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '12px 16px',
  borderTop: `1px solid ${theme.borderSubtle}`,
  background: theme.surface,
  gap: 12,
};

function chipStyle(active) {
  return {
    appearance: 'none',
    borderRadius: 18,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    background: active ? 'rgba(217,119,87,.12)' : theme.surface,
    color: theme.text,
    cursor: 'pointer',
    maxWidth: '100%',
    whiteSpace: 'normal',
    overflowWrap: 'break-word',
    textAlign: 'left',
  };
}

const continueBtn = (disabled) => ({
  appearance: 'none',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  background: disabled ? 'rgba(0,0,0,.08)' : theme.accent,
  color: disabled ? theme.textTertiary : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
});

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

function TextOptionsControl({ q, value, onChange }) {
  const [other, setOther] = useState('');
  const areaRef = useRef(null);
  const measureRef = useRef(null);
  const selected = new Set(
    Array.isArray(value) ? value.map(String) : value != null && value !== '' ? [String(value)] : [],
  );

  useLayoutEffect(() => {
    const area = areaRef.current;
    const measure = measureRef.current;
    if (!area || !measure) return;
    const wrap = measure.offsetWidth > 134;
    area.style.flex = wrap ? '1 0 100%' : '';
    area.style.height = 'auto';
    if (wrap) {
      const border = area.offsetHeight - area.clientHeight;
      area.style.height = `${area.scrollHeight + border}px`;
    }
  }, [other]);

  const toggle = (opt) => {
    if (q.multi) {
      const next = new Set(selected);
      if (next.has(opt)) next.delete(opt);
      else {
        for (const o of q.options ?? []) {
          if (isAllOfTheAbove(opt) !== isAllOfTheAbove(o)) next.delete(o);
        }
        next.add(opt);
      }
      onChange([...next]);
    } else {
      onChange(opt);
    }
  };

  const otherActive = !!other && selected.has(other);

  return (
    <div style={chipRow}>
      {(q.options ?? []).map((opt) => (
        <button
          key={opt}
          type="button"
          style={chipStyle(selected.has(opt))}
          onClick={() => toggle(opt)}
        >
          {opt}
        </button>
      ))}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          visibility: 'hidden',
          whiteSpace: 'pre',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {other}
      </span>
      <textarea
        ref={areaRef}
        rows={1}
        placeholder="Other…"
        value={other}
        style={{
          padding: '8px 12px',
          borderRadius: 18,
          border: `1px solid ${otherActive ? theme.accent : theme.border}`,
          background: otherActive ? 'rgba(217,119,87,.08)' : theme.surface,
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 500,
          width: 160,
          resize: 'none',
          overflow: 'hidden',
          outline: 'none',
        }}
        onPointerDown={() => {
          if (!q.multi && other) onChange(other);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
        }}
        onChange={(e) => {
          const T = e.target.value.replace(/\n/g, '');
          if (q.multi) {
            const next = new Set(selected);
            if (other && !(q.options ?? []).includes(other)) next.delete(other);
            if (T) next.add(T);
            onChange([...next]);
          } else if (T) {
            onChange(T);
          }
          setOther(T);
        }}
      />
    </div>
  );
}

function SvgOptionsControl({ q, value, onChange }) {
  const selected = new Set(
    Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [],
  );
  const options = (q.options ?? []).map((svg, i) => ({ svg, index: i }));

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
    <div style={chipRow}>
      {options.map(({ svg, index }) => (
        <button
          key={index}
          type="button"
          style={{
            ...chipStyle(selected.has(String(index))),
            width: 96,
            height: 72,
            padding: 6,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => toggle(index)}
        >
          <span
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </button>
      ))}
    </div>
  );
}

function SliderControl({ q, value, onChange }) {
  const num = typeof value === 'number' ? value : (q.default ?? q.min ?? 0);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 12,
        color: theme.textSecondary,
      }}
    >
      <span>{q.min ?? 0}</span>
      <input
        type="range"
        min={q.min ?? 0}
        max={q.max ?? 100}
        step={q.step ?? 1}
        value={num}
        style={{ flex: 1, accentColor: theme.accent }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{q.max ?? 100}</span>
      <strong style={{ minWidth: 40, textAlign: 'right', color: theme.text }}>{num}</strong>
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
      style={{
        display: 'block',
        padding: 20,
        border: `2px dashed ${value ? theme.accent : theme.border}`,
        borderRadius: 8,
        background: theme.surface,
        textAlign: 'center',
        fontSize: 12,
        color: theme.textSecondary,
        cursor: 'pointer',
      }}
    >
      <input type="file" accept={q.accept} onChange={onFile} style={{ display: 'none' }} />
      {busy ? 'Uploading…' : value ? `✓ ${value}` : 'Click to upload a file'}
    </label>
  );
}

function FreeformControl({ q, value, onChange }) {
  return (
    <textarea
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Your answer…"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 80,
        padding: 10,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        background: theme.surface,
        fontSize: 13,
        fontFamily: 'inherit',
        resize: 'vertical',
        outline: 'none',
      }}
    />
  );
}

function QuestionField({ q, value, onChange, designName }) {
  switch (q.kind) {
    case 'text-options':
      return <TextOptionsControl q={q} value={value} onChange={onChange} />;
    case 'svg-options':
      return <SvgOptionsControl q={q} value={value} onChange={onChange} />;
    case 'slider':
      return <SliderControl q={q} value={value} onChange={onChange} />;
    case 'file':
      return <FileControl q={q} value={value} onChange={onChange} designName={designName} />;
    case 'freeform':
      return <FreeformControl q={q} value={value} onChange={onChange} />;
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
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
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
    <div style={shell} className="ds-review-ui" role="dialog" aria-modal="true">
      <div style={scroll}>
        <div style={inner}>
          <h1 style={titleStyle}>{spec.title || 'Quick questions'}</h1>
          {spec.questions.map((q) => (
            <div key={q.id} style={block}>
              <div style={qTitle}>{q.title}</div>
              {q.subtitle && <div style={qSubtitle}>{q.subtitle}</div>}
              <QuestionField
                q={q}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
                designName={designName}
              />
            </div>
          ))}
        </div>
      </div>
      <div style={footer}>
        <button
          type="button"
          style={continueBtn(submitting)}
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Continuing…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
