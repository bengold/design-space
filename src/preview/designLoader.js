const designModules = import.meta.glob('../../designs/*/Design.jsx');

export async function fetchActiveDesignName() {
  try {
    const res = await fetch('/designs/active.json');
    if (!res.ok) return 'demo';
    const data = await res.json();
    return data?.name || 'demo';
  } catch {
    return 'demo';
  }
}

export async function loadDesign(name) {
  const key = Object.keys(designModules).find((k) => k.endsWith(`/designs/${name}/Design.jsx`));
  if (!key) {
    throw new Error(
      `Design "${name}" not found. Run: npx design-space list — or: npx design-space scaffold ${name}`,
    );
  }
  const mod = await designModules[key]();
  if (!mod?.default) throw new Error(`Design "${name}" has no default export in Design.jsx`);
  return { name, Component: mod.default };
}

export async function loadActiveDesign() {
  const name = await fetchActiveDesignName();
  return loadDesign(name);
}
