/** Figma-style inspector groups — common CSS properties agents can round-trip via overrides.json */

export const CSS_GROUPS = [
  {
    id: 'layout',
    label: 'Layout',
    props: [
      {
        key: 'display',
        type: 'select',
        options: ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none'],
      },
      {
        key: 'position',
        type: 'select',
        options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
      },
      { key: 'top', type: 'text' },
      { key: 'right', type: 'text' },
      { key: 'bottom', type: 'text' },
      { key: 'left', type: 'text' },
      { key: 'zIndex', type: 'text' },
      { key: 'width', type: 'text' },
      { key: 'height', type: 'text' },
      { key: 'minWidth', type: 'text' },
      { key: 'maxWidth', type: 'text' },
      { key: 'minHeight', type: 'text' },
      { key: 'maxHeight', type: 'text' },
      { key: 'overflow', type: 'select', options: ['visible', 'hidden', 'auto', 'scroll'] },
    ],
  },
  {
    id: 'flex',
    label: 'Flex / Grid',
    props: [
      {
        key: 'flexDirection',
        type: 'select',
        options: ['row', 'row-reverse', 'column', 'column-reverse'],
      },
      { key: 'flexWrap', type: 'select', options: ['nowrap', 'wrap', 'wrap-reverse'] },
      {
        key: 'justifyContent',
        type: 'select',
        options: [
          'flex-start',
          'center',
          'flex-end',
          'space-between',
          'space-around',
          'space-evenly',
        ],
      },
      {
        key: 'alignItems',
        type: 'select',
        options: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
      },
      {
        key: 'alignContent',
        type: 'select',
        options: ['stretch', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
      },
      { key: 'gap', type: 'text' },
      { key: 'flex', type: 'text' },
      { key: 'flexGrow', type: 'text' },
      { key: 'flexShrink', type: 'text' },
      { key: 'flexBasis', type: 'text' },
      { key: 'gridTemplateColumns', type: 'text' },
      { key: 'gridTemplateRows', type: 'text' },
    ],
  },
  {
    id: 'spacing',
    label: 'Spacing',
    props: [
      { key: 'margin', type: 'text' },
      { key: 'marginTop', type: 'text' },
      { key: 'marginRight', type: 'text' },
      { key: 'marginBottom', type: 'text' },
      { key: 'marginLeft', type: 'text' },
      { key: 'padding', type: 'text' },
      { key: 'paddingTop', type: 'text' },
      { key: 'paddingRight', type: 'text' },
      { key: 'paddingBottom', type: 'text' },
      { key: 'paddingLeft', type: 'text' },
    ],
  },
  {
    id: 'typography',
    label: 'Typography',
    props: [
      { key: 'fontFamily', type: 'text' },
      { key: 'fontSize', type: 'text' },
      { key: 'fontWeight', type: 'text' },
      { key: 'fontStyle', type: 'select', options: ['normal', 'italic'] },
      { key: 'lineHeight', type: 'text' },
      { key: 'letterSpacing', type: 'text' },
      { key: 'textAlign', type: 'select', options: ['left', 'center', 'right', 'justify'] },
      { key: 'textDecoration', type: 'text' },
      {
        key: 'textTransform',
        type: 'select',
        options: ['none', 'uppercase', 'lowercase', 'capitalize'],
      },
      { key: 'color', type: 'text' },
    ],
  },
  {
    id: 'fill',
    label: 'Fill',
    props: [
      { key: 'background', type: 'text' },
      { key: 'backgroundColor', type: 'text' },
      { key: 'opacity', type: 'text' },
    ],
  },
  {
    id: 'border',
    label: 'Border',
    props: [
      { key: 'border', type: 'text' },
      { key: 'borderWidth', type: 'text' },
      { key: 'borderStyle', type: 'select', options: ['none', 'solid', 'dashed', 'dotted'] },
      { key: 'borderColor', type: 'text' },
      { key: 'borderRadius', type: 'text' },
      { key: 'borderTopLeftRadius', type: 'text' },
      { key: 'borderTopRightRadius', type: 'text' },
      { key: 'borderBottomLeftRadius', type: 'text' },
      { key: 'borderBottomRightRadius', type: 'text' },
    ],
  },
  {
    id: 'effects',
    label: 'Effects',
    props: [
      { key: 'boxShadow', type: 'text' },
      { key: 'filter', type: 'text' },
      { key: 'backdropFilter', type: 'text' },
      { key: 'transform', type: 'text' },
    ],
  },
];

export function camelToKebab(key) {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function readStyleSnapshot(el, existing = {}) {
  const cs = getComputedStyle(el);
  const snap = { ...existing };
  for (const group of CSS_GROUPS) {
    for (const { key } of group.props) {
      const kebab = camelToKebab(key);
      const val = cs.getPropertyValue(kebab);
      if (val && snap[key] === undefined) snap[key] = val;
    }
  }
  return snap;
}

export function stylesToCssRule(ref, { styles = {}, cssText = '' }) {
  const decl = Object.entries(styles)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${camelToKebab(k)}:${v} !important`)
    .join(';');
  const extra = cssText?.trim() ? cssText.trim().replace(/\s+/g, ' ') : '';
  const body = [decl, extra].filter(Boolean).join(';');
  return body ? `[data-ds-ref="${ref}"]{${body}}` : '';
}
