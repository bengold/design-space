/** Local stand-in for Claude Design's file bridge (omelette runtime). */
export function installOmeletteBridge() {
  window.omelette = {
    async writeFile(file, content) {
      const res = await fetch('/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file, content }),
      });
      if (!res.ok) throw new Error(`write failed: ${file}`);
    },
  };
}
