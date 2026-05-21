import { writeDesignFile, fetchDesignJson } from '../preview/persistDesignFile.js';

export async function appendReviewEvent(designName, type, payload = {}) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    type,
    design: designName,
    ...payload,
  });
  const res = await fetch('/api/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `designs/${designName}/events.jsonl`, line: line + '\n' }),
  });
  if (!res.ok) throw new Error('append event failed');
}

export async function fetchReviewEvents(designName, since = null) {
  try {
    const res = await fetch(`/designs/${designName}/events.jsonl`);
    if (!res.ok) return [];
    const text = await res.text();
    const events = text
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!since) return events;
    return events.filter((e) => e.at > since);
  } catch {
    return [];
  }
}
