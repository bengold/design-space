#!/usr/bin/env node
/**
 * Bundle mcp-server/index.mjs into a single self-contained ESM file.
 *
 * Output: mcp-server/dist/index.mjs — committed to git so the plugin works
 * without `npm install`, since Claude Code's marketplace install just copies
 * the plugin directory to ~/.claude/plugins/cache without running install.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(ROOT, 'mcp-server', 'index.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(ROOT, 'mcp-server', 'dist', 'index.mjs'),
  // ESM bundle needs a require() shim for the few transitive deps (ajv) that
  // call require() at runtime. The source file's `#!/usr/bin/env node` shebang
  // is preserved by esbuild, so the banner only injects the shim.
  banner: {
    js: [
      'import { createRequire as __dsCreateRequire } from "node:module";',
      'const require = __dsCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  legalComments: 'none',
  logLevel: 'info',
});
