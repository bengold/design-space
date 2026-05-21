import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const execFile = promisify(execFileCb);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'design-space.mjs');
const TEST_DESIGN = `smoke-${process.pid}-${Date.now().toString(36)}`;

function cli(...args) {
  return execFile(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });
}

afterAll(() => {
  const dir = path.join(ROOT, 'designs', TEST_DESIGN);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  // Restore prior active design (the smoke run flips active to the test design).
  const activeFile = path.join(ROOT, 'designs', 'active.json');
  try {
    const current = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    if (current?.name === TEST_DESIGN) {
      fs.writeFileSync(activeFile, JSON.stringify({ name: 'demo' }, null, 2) + '\n');
    }
  } catch {
    /* ignore */
  }
});

describe('design-space CLI smoke', () => {
  it('scaffolds, validates, lists, and round-trips tweaks', async () => {
    await cli('scaffold', TEST_DESIGN, '--title', 'Smoke Test');
    const dir = path.join(ROOT, 'designs', TEST_DESIGN);
    expect(fs.existsSync(path.join(dir, 'Design.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tweaks.defaults.json'))).toBe(true);

    const { stdout: validateOut } = await cli('validate', TEST_DESIGN);
    expect(validateOut).toMatch(/^OK:/);

    const { stdout: listOut } = await cli('list');
    expect(listOut).toContain(TEST_DESIGN);

    await cli('tweaks', 'set', '--design', TEST_DESIGN, 'primaryColor', '"#2A6FDB"');
    const { stdout: tweaksOut } = await cli('tweaks', 'get', '--design', TEST_DESIGN);
    const tweaks = JSON.parse(tweaksOut);
    expect(tweaks.saved.primaryColor).toBe('#2A6FDB');
    expect(tweaks.merged.primaryColor).toBe('#2A6FDB');
  });

  it('round-trips canvas state', async () => {
    const stateFile = path.join(ROOT, 'public', '.design-canvas.state.json');
    const backup = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null;
    try {
      const payload = {
        sections: {
          s: { title: 'S', order: ['a'], labels: {}, hidden: [], srcKey: 'a' },
        },
      };
      await cli('state', 'set', JSON.stringify(payload));
      const { stdout } = await cli('state', 'get');
      expect(JSON.parse(stdout)).toEqual(payload);
    } finally {
      if (backup != null) fs.writeFileSync(stateFile, backup);
      else fs.rmSync(stateFile, { force: true });
    }
  });

  it('rejects invalid design names in scaffold', async () => {
    await expect(cli('scaffold', 'Has-Caps')).rejects.toThrow(/name must match/i);
  });
});
