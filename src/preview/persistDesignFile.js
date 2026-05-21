export async function writeDesignFile(relPath, data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
  const res = await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: relPath, content }),
  });
  if (!res.ok) throw new Error(`write failed: ${relPath}`);
}

export async function fetchDesignJson(designName, filename, fallback) {
  try {
    const res = await fetch(`/designs/${designName}/${filename}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}
