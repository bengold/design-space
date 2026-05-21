import React from 'react';
import { DesignCanvas, DCPage } from '../../src/lib/design-canvas.jsx';
import { OnboardingPage, DashboardPage } from './pages/finance.jsx';
import { IridescentCardPage } from './pages/iridescent-card.jsx';
import { TextStreamingPage } from './pages/text-streaming.jsx';

// Demo design — multiple pages, each free to pick its own rendering style and
// its own set of tweaks.
//
//   - Onboarding / Dashboard: canvas pages with multiple artboards. Share the
//     same APP_TWEAKS (font, density, palette, primary color, dark mode)
//     because they're variants of the same app.
//   - Cards: a raw page (no canvas, no artboards). The holographic-card
//     showcase renders full-viewport with its own CARD_TWEAKS.
//   - Streaming: a raw page that fills the viewport with a grid of streaming
//     animation patterns. Its own STREAM_TWEAKS.
//
// Per-page tweaks: each page component calls useDesignTweaksDialKit with its
// own config. The DialKit panel swaps as the active page changes. Values
// merge in tweaks.json so nothing is lost on page-switch.

export default function Design({ designName = 'demo' }) {
  return (
    <DesignCanvas>
      <DCPage id="onboarding" title="Onboarding">
        <OnboardingPage designName={designName} />
      </DCPage>
      <DCPage id="dashboard" title="Dashboard">
        <DashboardPage designName={designName} />
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
