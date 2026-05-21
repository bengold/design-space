import React from 'react';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

// DesignTweaksRoot
// ────────────────
// Owns the host-bridge protocol so individual designs don't reimplement it:
//   • posts __edit_mode_available once at mount (toolbar Tweaks button enables)
//   • listens for __activate_edit_mode / __deactivate_edit_mode (host toolbar)
//   • posts __edit_mode_dismissed when DialKit's collapse button is used
//   • conditionally mounts <DialRoot> only while active
//
// DialKit doesn't expose external visibility control directly — DialRoot
// renders a permanent corner bubble that the user clicks to toggle. We don't
// want that bubble visible until the host explicitly enables tweaks mode, so
// we mount/unmount the whole DialRoot tree based on `open`. When DialKit's
// own collapse button is clicked we observe the data-collapsed attribute
// change and mirror that back to the host so the toolbar toggle stays in
// sync. (See src/host/useDesignHostBridge.js — it expects
// __edit_mode_dismissed on user-driven close.)
export function DesignTweaksRoot({ position = 'bottom-right', defaultOpen = true }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    // Announce capability so the host toolbar can show the Tweaks button.
    // Posted after the listener attaches so a synchronous activate from
    // the host doesn't race past us.
    if (window.parent) {
      window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    }
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // When the user collapses the DialKit panel via its own X button, mirror
  // that to the host so the toolbar toggle flips off in lockstep. We watch
  // for the data-collapsed=true mutation rather than wrapping DialKit's
  // internals. Effect re-runs every time we mount DialRoot.
  React.useEffect(() => {
    if (!open) return undefined;
    let observer;
    let attempt = 0;
    const startObserving = () => {
      const inner = document.querySelector('.dialkit-panel-inner');
      if (!inner) {
        if (attempt++ < 20) {
          // DialRoot mounts asynchronously (it gates on `mounted` state) so
          // the inner element may not exist on the first effect run.
          setTimeout(startObserving, 16);
        }
        return;
      }
      observer = new MutationObserver(() => {
        const collapsed = inner.getAttribute('data-collapsed') === 'true';
        if (collapsed) {
          setOpen(false);
          if (window.parent) {
            window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
          }
        }
      });
      observer.observe(inner, { attributes: true, attributeFilter: ['data-collapsed'] });
    };
    startObserving();
    return () => {
      if (observer) observer.disconnect();
    };
  }, [open]);

  if (!open) return null;
  // productionEnabled forces render — design-space's preview is treated as
  // production by the user-facing iframe even though we're a dev tool.
  return <DialRoot position={position} defaultOpen={defaultOpen} productionEnabled />;
}
