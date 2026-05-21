import { useEffect, useMemo, useState } from 'react';
import { CSS_GROUPS, readStyleSnapshot, stylesToCssRule } from './css-property-schema.js';
import { ensureDsRef } from './elementContext.js';

const panel = {
  position: 'fixed',
  right: 16,
  top: 56,
  width: 320,
  maxHeight: 'calc(100vh - 72px)',
  overflow: 'auto',
  background: '#29261b',
  color: '#f6f4ef',
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 12,
  padding: 12,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,.35)',
  zIndex: 100000,
};

const label = { display: 'block', fontSize: 10, opacity: 0.55, marginBottom: 3 };
const input = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.06)',
  color: '#f6f4ef',
  borderRadius: 6,
  padding: '5px 8px',
  font: 'inherit',
  marginBottom: 6,
};
const btn = {
  appearance: 'none',
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.1)',
  color: '#f6f4ef',
  borderRadius: 8,
  padding: '8px 12px',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
};

export function EditPanel({ el, overrides, onApply, onClose }) {
  const ref = ensureDsRef(el);
  const existing = overrides[ref] || {};
  const [text, setText] = useState('');
  const [styles, setStyles] = useState({});
  const [cssText, setCssText] = useState(existing.cssText || '');
  const [openGroups, setOpenGroups] = useState(() => new Set(['layout', 'typography', 'fill']));

  useEffect(() => {
    setText((el.textContent || '').trim().slice(0, 500));
    setStyles(readStyleSnapshot(el, existing.styles || {}));
    setCssText(existing.cssText || '');
  }, [el, ref, existing.styles, existing.cssText]);

  const previewRule = useMemo(
    () => stylesToCssRule(ref, { styles, cssText }),
    [ref, styles, cssText],
  );

  const setStyle = (key, value) => setStyles((s) => ({ ...s, [key]: value }));

  return (
    <div className="ds-review-ui" style={panel}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>Design</strong>
        <button
          type="button"
          style={{ ...btn, width: 'auto', padding: '4px 10px' }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          fontSize: 10,
          opacity: 0.45,
          fontFamily: 'ui-monospace, monospace',
          marginBottom: 10,
        }}
      >
        {ref}
      </div>

      <details open style={{ marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 6 }}>Content</summary>
        <textarea
          style={{ ...input, minHeight: 56, resize: 'vertical' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </details>

      {CSS_GROUPS.map((group) => (
        <details
          key={group.id}
          open={openGroups.has(group.id)}
          onToggle={(e) => {
            setOpenGroups((g) => {
              const n = new Set(g);
              if (e.target.open) n.add(group.id);
              else n.delete(group.id);
              return n;
            });
          }}
          style={{ marginBottom: 6, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 6 }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 6 }}>
            {group.label}
          </summary>
          {group.props.map((prop) => (
            <div key={prop.key}>
              <span style={label}>{prop.key}</span>
              {prop.type === 'select' ? (
                <select
                  style={input}
                  value={styles[prop.key] ?? ''}
                  onChange={(e) => setStyle(prop.key, e.target.value)}
                >
                  <option value="">—</option>
                  {prop.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={input}
                  value={styles[prop.key] ?? ''}
                  onChange={(e) => setStyle(prop.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </details>
      ))}

      <details style={{ marginBottom: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 6 }}>
          Custom CSS
        </summary>
        <textarea
          style={{ ...input, minHeight: 48, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
          placeholder="e.g. transform: rotate(2deg);"
          value={cssText}
          onChange={(e) => setCssText(e.target.value)}
        />
        {previewRule && (
          <pre style={{ fontSize: 9, opacity: 0.4, margin: 0, whiteSpace: 'pre-wrap' }}>
            {previewRule}
          </pre>
        )}
      </details>

      <button
        type="button"
        style={btn}
        onClick={() =>
          onApply(ref, {
            styles,
            cssText: cssText.trim() || undefined,
            textContent: text,
          })
        }
      >
        Apply & save
      </button>
    </div>
  );
}
