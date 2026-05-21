export function tweaksStorageKey(designName) {
  return `design-space.tweaks:${designName}`;
}

export async function fetchJson(path, fallback) {
  try {
    const res = await fetch(path);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function loadTweakValues(designName, fallbackDefaults) {
  const defaults = await fetchJson(`/designs/${designName}/tweaks.defaults.json`, fallbackDefaults);
  const saved = await fetchJson(`/designs/${designName}/tweaks.json`, {});
  return { ...defaults, ...saved };
}

export function loadTweaksFromLocalStorage(designName, merged) {
  try {
    const saved = JSON.parse(localStorage.getItem(tweaksStorageKey(designName)) || 'null');
    if (saved && typeof saved === 'object') return { ...merged, ...saved };
  } catch {
    /* ignore */
  }
  return merged;
}

export async function persistTweakEdits(designName, edits) {
  try {
    const key = tweaksStorageKey(designName);
    const prev = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...prev, ...edits };
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }

  try {
    const prev = await fetchJson(`/designs/${designName}/tweaks.json`, {});
    const next = { ...prev, ...edits };
    await fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: `designs/${designName}/tweaks.json`,
        content: JSON.stringify(next, null, 2) + '\n',
      }),
    });
  } catch {
    /* ignore */
  }
}
