import React from 'react';
import { DesignCanvas, DCSection, DCArtboard } from '../../src/lib/design-canvas.jsx';
import { useDesignTweaksDialKit } from '../../src/preview/useDesignTweaksDialKit.js';

// DialKit config:
//   • [n, min, max] → slider with range
//   • { type: 'color', default } → color picker
//   • { type: 'select', options, default } → select
//   • boolean → toggle
// Top-level object values become folder groups in the panel.
// See src/preview/useDesignTweaksDialKit.js for the full schema.
const TWEAK_CONFIG = {
  primaryColor: {
    type: 'select',
    options: [
      { value: '#D97757', label: 'Warm' },
      { value: '#2A6FDB', label: 'Cobalt' },
      { value: '#1F8A5B', label: 'Forest' },
    ],
    default: '#D97757',
  },
  fontSize: [16, 12, 24],
};

export default function Design() {
  const t = useDesignTweaksDialKit('__NAME__', TWEAK_CONFIG);

  return (
    <DesignCanvas>
      <DCSection id="main" title="__TITLE__" subtitle="Edit designs/__NAME__/Design.jsx">
        <DCArtboard id="v1" label="Variant A" width={280} height={480}>
          <div
            style={{
              height: '100%',
              padding: 24,
              boxSizing: 'border-box',
              background: '#fff',
              color: '#29261b',
              fontFamily: 'system-ui, sans-serif',
              fontSize: t.fontSize,
            }}
          >
            <h2 style={{ margin: '0 0 8px', color: t.primaryColor }}>__TITLE__</h2>
            <p style={{ margin: 0, opacity: 0.7 }}>Replace this artboard with your UI.</p>
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
