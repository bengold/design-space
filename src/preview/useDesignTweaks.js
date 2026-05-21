import React from 'react';
import { useTweaks } from '../lib/tweaks-panel.jsx';
import { loadTweakValues, loadTweaksFromLocalStorage, persistTweakEdits } from './tweakStorage.js';

/**
 * Loads defaults from designs/<name>/tweaks.defaults.json, merges saved
 * designs/<name>/tweaks.json + localStorage, and persists UI edits back to disk.
 */
export function useDesignTweaks(designName, fallbackDefaults) {
  const [ready, setReady] = React.useState(false);
  const [values, setTweak] = useTweaks(fallbackDefaults);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromDisk = await loadTweakValues(designName, fallbackDefaults);
      const withLocal = loadTweaksFromLocalStorage(designName, fromDisk);
      if (!cancelled) {
        setTweak(withLocal);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [designName, setTweak]);

  React.useEffect(() => {
    if (!ready) return undefined;
    const onTweak = (e) => persistTweakEdits(designName, e.detail);
    window.addEventListener('tweakchange', onTweak);
    return () => window.removeEventListener('tweakchange', onTweak);
  }, [designName, ready]);

  return [values, setTweak, { ready, designName }];
}
