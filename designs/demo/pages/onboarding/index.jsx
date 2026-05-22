import React from 'react';
import { DCSection, DCArtboard } from '../../../../src/lib/design-canvas.jsx';
import { IOSDevice } from '../../../../src/lib/ios-frame.jsx';
import { useDesignTweaks } from '../../../../src/lib/tweaks-panel.jsx';

import {
  WelcomeScreen,
  PhoneScreen,
  VerifyScreen,
  ProfileScreen,
  LocationScreen,
  PaymentScreen,
  ReadyScreen,
} from './screens.jsx';

// Loop — bike-share signup flow. All 7 screens on a single canvas page, each
// wrapped in <IOSDevice> for authentic iPhone chrome.
//
// Tweaks: primary brand color, accent (highlight) color, deep variant for
// gradients, dark device chrome.
const ONBOARDING_TWEAKS = {
  primary: { type: 'color', default: '#1B47F0' }, // brand blue
  primaryDeep: { type: 'color', default: '#0E2BB8' }, // gradient end
  accent: { type: 'color', default: '#FF6A2C' }, // highlight orange
  deviceDark: false, // dark iPhone chrome (not the screens)
};

// Build the resolved palette from tweaks. Static base colors come from the
// original Loop design; user-tunable ones flow from `t`.
function resolvePalette(t) {
  return {
    // tunable
    primary: t.primary,
    primaryDeep: t.primaryDeep,
    primarySoft: '#E7ECFF',
    accent: t.accent,
    accentSoft: '#FFE4D4',
    // static
    ink: '#0B1020',
    ink2: '#3A3F55',
    ink3: '#8B91A8',
    bg: '#F6F4EE',
    card: '#FFFFFF',
    line: 'rgba(11,16,32,0.08)',
  };
}

// DCSection discovers artboards via `c.type === DCArtboard` on its direct
// children — wrapping in a helper component would break that check, so
// inline DCArtboard + IOSDevice for each screen.
const ARTBOARD_W = 402;
const ARTBOARD_H = 874;

const SCREENS = [
  { id: 'welcome', label: 'A · Welcome', Component: WelcomeScreen },
  { id: 'phone', label: 'B · Phone', Component: PhoneScreen },
  { id: 'verify', label: 'C · Verify', Component: VerifyScreen },
  { id: 'profile', label: 'D · Profile', Component: ProfileScreen },
  { id: 'location', label: 'E · Location', Component: LocationScreen },
  { id: 'payment', label: 'F · Payment', Component: PaymentScreen },
  { id: 'ready', label: 'G · Ready', Component: ReadyScreen },
];

// Global keyframes used by screens (caret blink). Injected once at the page
// level — duplicate <style> blocks are harmless, but we only need one.
const KEYFRAMES = `@keyframes loopCaret { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }`;

export function OnboardingPage({ designName }) {
  const t = useDesignTweaks(designName, ONBOARDING_TWEAKS);
  const p = resolvePalette(t);
  return (
    <>
      <style>{KEYFRAMES}</style>
      <DCSection
        id="loop-flow"
        title="Loop signup"
        subtitle="Welcome → Phone → Verify → Profile → Location → Payment → Ready"
      >
        {SCREENS.map(({ id, label, Component }) => (
          <DCArtboard key={id} id={id} label={label} width={ARTBOARD_W} height={ARTBOARD_H}>
            <IOSDevice dark={t.deviceDark}>
              <Component p={p} />
            </IOSDevice>
          </DCArtboard>
        ))}
      </DCSection>
    </>
  );
}
