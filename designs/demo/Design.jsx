import React from 'react';
import { DesignCanvas, DCPage } from '../../src/lib/design-canvas.jsx';
import { OnboardingPage } from './pages/onboarding/index.jsx';
import { IridescentCardPage } from './pages/iridescent-card/index.jsx';
import { TextStreamingPage } from './pages/text-streaming/index.jsx';

// Demo design — each page is a self-contained folder under `pages/` with its
// own screens, helpers, and tweak config. The agent (or human) can add new
// pages by scaffolding a new folder and dropping a <DCPage> below.
//
//   - Onboarding: canvas page with the 7-screen Loop bike-share signup flow,
//     each artboard wrapped in <IOSDevice>.
//   - Cards: a raw page (no canvas, no artboards). The holographic-card
//     showcase renders full-viewport with its own card tweaks.
//   - Streaming: a raw page that fills the viewport with a grid of streaming
//     animation patterns. Its own theme/speed tweaks.
//
// Per-page tweaks: each page component calls useDesignTweaks with its own
// config. A single floating panel (mounted once at preview root) swaps to
// show the active page's controls. Values merge in tweaks.json so nothing
// is lost on page-switch.

export default function Design({ designName = 'demo' }) {
  return (
    <DesignCanvas>
      <DCPage id="onboarding" title="Onboarding">
        <OnboardingPage designName={designName} />
      </DCPage>
      <DCPage id="cards" title="Cards" raw>
        <IridescentCardPage designName={designName} />
      </DCPage>
      <DCPage id="streaming" title="Streaming" raw>
        <TextStreamingPage designName={designName} />
      </DCPage>
    </DesignCanvas>
  );
}
