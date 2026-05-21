import React from 'react';
import { DesignCanvas, DCSection, DCArtboard } from '../../src/lib/design-canvas.jsx';
import { TweaksPanel, TweakSection, TweakColor, TweakSlider } from '../../src/lib/tweaks-panel.jsx';
import { useDesignTweaks } from '../../src/preview/useDesignTweaks.js';

const FALLBACK_DEFAULTS = {
  primaryColor: '#D97757',
  fontSize: 16,
};

export default function Design() {
  const [t, setTweak] = useDesignTweaks('__NAME__', FALLBACK_DEFAULTS);

  return (
    <>
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
      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor
          label="Primary"
          value={t.primaryColor}
          options={['#D97757', '#2A6FDB', '#1F8A5B']}
          onChange={(v) => setTweak('primaryColor', v)}
        />
        <TweakSlider
          label="Font size"
          value={t.fontSize}
          min={12}
          max={24}
          unit="px"
          onChange={(v) => setTweak('fontSize', v)}
        />
      </TweaksPanel>
    </>
  );
}
