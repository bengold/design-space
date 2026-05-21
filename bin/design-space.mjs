#!/usr/bin/env node
/**
 * Agent-facing CLI for Design Space.
 * All state is plain JSON/JSX on disk — no browser required for read/write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  appendEventLine,
  exportAgentFeedback,
  openQuestions,
  persistCommentsBundleFs,
  readEvents,
  resolveCommentsFs,
  waitForQuestions,
} from '../lib/design-space-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNS = path.join(ROOT, 'designs');
const ACTIVE_FILE = path.join(DESIGNS, 'active.json');
const CANVAS_STATE = path.join(ROOT, 'public', '.design-canvas.state.json');
const TEMPLATE = path.join(DESIGNS, '_template');

const HELP = `design-space — local Claude Design host for coding agents

Usage:
  design-space dev [--design <name>] [--port <n>]
  design-space list
  design-space use <name>
  design-space scaffold <name> [--title <title>]
  design-space validate [<name>]
  design-space url [--design <name>] [--port <n>]
  design-space state get
  design-space state set <json|'-'>
  design-space tweaks get [--design <name>]
  design-space tweaks set [--design <name>] <key> <jsonValue>
  design-space tweaks merge [--design <name>] <json|'-'>
  design-space questions get|set|ask|wait|dismiss [--design <name>] [--timeout <sec>] [json|'-']
  design-space comments get|resolve|send [--design <name>] [commentId...]
  design-space inbox get [--design <name>]
  design-space overrides get|set [--design <name>] <json|->
  design-space feedback export [--design <name>]
  design-space events poll [--design <name>] [--since <iso>] [--limit <n>]
  design-space mcp install <cursor|cursor-global|claude-desktop>
  design-space doctor

Agent workflow:
  1. scaffold + edit designs/<name>/Design.jsx
  2. design-space dev
  3. Read/write tweaks, questions, comments, overrides, agent-feedback.md, canvas state
`;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function listDesigns() {
  return fs
    .readdirSync(DESIGNS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(DESIGNS, name, 'Design.jsx')));
}

function getActiveName() {
  return readJson(ACTIVE_FILE, { name: 'demo' })?.name || 'demo';
}

function setActiveName(name) {
  writeJson(ACTIVE_FILE, { name });
}

function designDir(name) {
  return path.join(DESIGNS, name);
}

function parseJsonArg(arg) {
  if (arg === '-') {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  }
  return JSON.parse(arg);
}

function validateDesign(name) {
  const dir = designDir(name);
  const errors = [];
  if (!fs.existsSync(dir)) errors.push(`missing directory: designs/${name}`);
  if (!fs.existsSync(path.join(dir, 'Design.jsx'))) errors.push('missing Design.jsx');
  if (!fs.existsSync(path.join(dir, 'tweaks.defaults.json')))
    errors.push('missing tweaks.defaults.json');
  return errors;
}

function scaffold(name, title) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    console.error('Name must match [a-z0-9][a-z0-9_-]*');
    process.exit(1);
  }
  const dir = designDir(name);
  if (fs.existsSync(dir)) {
    console.error(`Design already exists: designs/${name}`);
    process.exit(1);
  }
  const displayTitle = title || name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(TEMPLATE)) {
    const src = path.join(TEMPLATE, file);
    if (!fs.statSync(src).isFile()) continue;
    let content = fs.readFileSync(src, 'utf8');
    content = content.replaceAll('__NAME__', name).replaceAll('__TITLE__', displayTitle);
    fs.writeFileSync(path.join(dir, file), content, 'utf8');
  }
  setActiveName(name);
  console.log(`Created designs/${name} (active design set)`);
}

function cmdDev(args) {
  let design;
  let port = '5173';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--design') design = args[++i];
    else if (args[i] === '--port') port = args[++i];
  }
  if (design) setActiveName(design);
  const name = design || getActiveName();
  const errors = validateDesign(name);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`Active design: ${name}`);
  console.log(`Open: http://localhost:${port}/`);
  const child = spawn('npx', ['vite', '--port', port], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function cmdUrl(args) {
  let design;
  let port = '5173';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--design') design = args[++i];
    else if (args[i] === '--port') port = args[++i];
  }
  const name = design || getActiveName();
  console.log(
    JSON.stringify(
      {
        host: `http://localhost:${port}/`,
        preview: `http://localhost:${port}/preview.html`,
        design: name,
      },
      null,
      2,
    ),
  );
}

function tweaksFile(name) {
  return path.join(designDir(name), 'tweaks.json');
}

function tweaksDefaultsFile(name) {
  return path.join(designDir(name), 'tweaks.defaults.json');
}

function designFile(name, filename) {
  return path.join(designDir(name), filename);
}

function cmdQuestionsAsk(name, raw) {
  const payload = raw ? parseJsonArg(raw) : null;
  openQuestions(name, payload);
  console.log(`Opened refinement questions for designs/${name} (trigger=open).`);
  console.log(
    'User must have the host open at http://localhost:5173/ — modal appears within a few seconds.',
  );
  console.log(`Wait for answers: design-space questions wait --design ${name}`);
}

async function cmdQuestionsWait(name, timeoutSec) {
  try {
    const q = await waitForQuestions(name, timeoutSec);
    console.log(JSON.stringify(q, null, 2));
  } catch (err) {
    console.error(err.message);
    console.error('User may still have the modal open — check the host or run questions get.');
    process.exit(1);
  }
}

// design-space doctor — quick diagnostic that prints ✓ / ✗ / ⚠ rows for the
// things that go wrong most often. Exit non-zero if any ✗ rows are emitted.
function cmdDoctor() {
  let failed = 0;
  let warned = 0;
  const ok = (msg) => console.log(`  ✓ ${msg}`);
  const bad = (msg) => {
    failed += 1;
    console.log(`  ✗ ${msg}`);
  };
  const warn = (msg) => {
    warned += 1;
    console.log(`  ⚠ ${msg}`);
  };

  console.log('Project layout');
  if (fs.existsSync(DESIGNS)) ok(`designs/ exists at ${DESIGNS}`);
  else bad(`designs/ missing — run from inside a Design Space repo`);

  const active = readJson(ACTIVE_FILE, null)?.name;
  if (active) ok(`active design: ${active}`);
  else warn('designs/active.json missing or empty — first `design-space scaffold <name>`');

  if (active) {
    const dir = designDir(active);
    const designJsx = path.join(dir, 'Design.jsx');
    const tweaksFile = path.join(dir, 'tweaks.defaults.json');
    if (fs.existsSync(designJsx)) ok(`${active}/Design.jsx`);
    else bad(`${active}/Design.jsx missing`);
    if (fs.existsSync(tweaksFile)) ok(`${active}/tweaks.defaults.json`);
    else
      warn(
        `${active}/tweaks.defaults.json missing (designs may still render but tweaks won't persist)`,
      );
  }

  console.log('\nMCP server bundle');
  const bundle = path.join(ROOT, 'mcp-server', 'dist', 'index.mjs');
  if (fs.existsSync(bundle)) {
    const bundleSize = fs.statSync(bundle).size;
    const srcMtime = fs.statSync(path.join(ROOT, 'mcp-server', 'index.mjs')).mtimeMs;
    const bundleMtime = fs.statSync(bundle).mtimeMs;
    if (bundleMtime < srcMtime)
      warn('mcp-server/dist/index.mjs is older than the source — run `npm run build:mcp`');
    else ok(`mcp-server/dist/index.mjs (${Math.round(bundleSize / 1024)} KB)`);
  } else {
    bad('mcp-server/dist/index.mjs not built — run `npm run build:mcp`');
  }

  console.log('\nNode + tooling');
  const nodeVer = process.versions.node;
  const major = Number(nodeVer.split('.')[0]);
  if (major >= 20) ok(`node ${nodeVer}`);
  else bad(`node ${nodeVer} — engines.node is >=20`);

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = readJson(pkgPath, {});
  const vite = pkg.devDependencies?.vite;
  const tailwind = pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss;
  if (vite) ok(`vite ${vite}`);
  else warn('vite missing from devDependencies');
  if (tailwind) ok(`tailwindcss ${tailwind}`);
  else warn('tailwindcss missing');

  console.log('\nClaude Code plugin');
  const pluginManifest = path.join(ROOT, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(pluginManifest)) {
    const manifest = readJson(pluginManifest, {});
    ok(`.claude-plugin/plugin.json (v${manifest.version || '?'})`);
    const hookScript = path.join(ROOT, 'hooks', 'poll-comments.mjs');
    if (fs.existsSync(hookScript)) ok('hooks/poll-comments.mjs');
    else warn('hooks/poll-comments.mjs missing — UserPromptSubmit hook would 404');
  } else {
    warn('.claude-plugin/plugin.json missing — plugin install path unavailable');
  }
  const homeCache = path.join(
    process.env.HOME || '',
    '.claude',
    'plugins',
    'cache',
    'design-space',
  );
  if (fs.existsSync(homeCache)) ok(`installed at ${homeCache}`);
  else warn('plugin not installed locally — run /plugin marketplace add bengold/design-space');

  console.log('\nHost integrations');
  const cursorFile = path.join(ROOT, '.cursor', 'mcp.json');
  if (fs.existsSync(cursorFile)) ok('.cursor/mcp.json present');
  else warn('No .cursor/mcp.json — run `design-space mcp install cursor` to register');

  console.log(`\n${failed ? '✗' : warned ? '⚠' : '✓'} ${failed} failed, ${warned} warning(s)`);
  if (failed) process.exit(1);
}

function cmdMcpInstall(target) {
  const serverPath = path.join(ROOT, 'mcp-server', 'index.mjs');
  const block = {
    'design-space': {
      command: 'node',
      args: [serverPath],
      env: { DESIGN_SPACE_ROOT: ROOT },
    },
  };

  const configs = {
    cursor: { file: path.join(ROOT, '.cursor', 'mcp.json'), label: 'Cursor (project-scoped)' },
    'cursor-global': {
      file: path.join(process.env.HOME || '', '.cursor', 'mcp.json'),
      label: 'Cursor (global)',
    },
    'claude-desktop': {
      file:
        process.platform === 'darwin'
          ? path.join(
              process.env.HOME || '',
              'Library',
              'Application Support',
              'Claude',
              'claude_desktop_config.json',
            )
          : path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
      label: 'Claude Desktop',
    },
  };

  if (!target || !configs[target]) {
    console.log('Usage: design-space mcp install <cursor|cursor-global|claude-desktop>');
    console.log('');
    console.log('Resolved MCP server path:');
    console.log(`  ${serverPath}`);
    console.log('');
    console.log('For Claude Code plugin install, the .claude-plugin/ folder in this repo is');
    console.log('ready to register — see README.');
    process.exit(target ? 1 : 0);
  }

  const { file, label } = configs[target];
  const existing = readJson(file, { mcpServers: {} });
  existing.mcpServers = { ...(existing.mcpServers || {}), ...block };
  writeJson(file, existing);
  console.log(`Wrote ${label} MCP config:`);
  console.log(`  ${file}`);
  console.log('Restart the host to pick up the new server.');
}

const [cmd, sub, ...rest] = process.argv.slice(2);

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(HELP);
  process.exit(0);
}

try {
  await (async () => {
    switch (cmd) {
      case 'dev':
        cmdDev(rest);
        break;
      case 'doctor':
        cmdDoctor();
        break;
      case 'mcp':
        if (sub === 'install') {
          cmdMcpInstall(rest[0]);
        } else {
          console.error('Usage: design-space mcp install <cursor|cursor-global|claude-desktop>');
          process.exit(1);
        }
        break;
      case 'list': {
        const active = getActiveName();
        for (const name of listDesigns()) {
          const meta = readJson(path.join(designDir(name), 'meta.json'), {});
          const mark = name === active ? ' (active)' : '';
          console.log(`${name}${mark}${meta.title ? ` — ${meta.title}` : ''}`);
        }
        break;
      }
      case 'use': {
        const name = sub;
        if (!name) {
          console.error('Usage: design-space use <name>');
          process.exit(1);
        }
        if (validateDesign(name).length) {
          console.error(`Invalid design: ${name}`);
          process.exit(1);
        }
        setActiveName(name);
        console.log(`Active design: ${name}`);
        break;
      }
      case 'scaffold': {
        let title;
        const name = sub;
        if (!name) {
          console.error('Usage: design-space scaffold <name>');
          process.exit(1);
        }
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--title') title = rest[++i];
        }
        scaffold(name, title);
        break;
      }
      case 'validate': {
        const name = sub || getActiveName();
        const errors = validateDesign(name);
        if (errors.length) {
          console.error(`designs/${name}:\n  ` + errors.join('\n  '));
          process.exit(1);
        }
        console.log(`OK: designs/${name}`);
        break;
      }
      case 'url':
        cmdUrl(rest);
        break;
      case 'state':
        if (sub === 'get') {
          console.log(JSON.stringify(readJson(CANVAS_STATE, { sections: {} }), null, 2));
        } else if (sub === 'set') {
          const raw = rest[0];
          if (!raw) {
            console.error('Usage: design-space state set <json|->');
            process.exit(1);
          }
          const data = parseJsonArg(raw);
          writeJson(CANVAS_STATE, data);
          console.log('Wrote public/.design-canvas.state.json');
        } else {
          console.error('Usage: design-space state get|set');
          process.exit(1);
        }
        break;
      case 'questions': {
        let design;
        let timeoutSec = 600;
        const positional = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
          else if (rest[i] === '--timeout') timeoutSec = Number(rest[++i]) || 600;
          else positional.push(rest[i]);
        }
        const name = design || getActiveName();
        if (sub === 'get') {
          console.log(JSON.stringify(readJson(designFile(name, 'questions.json'), null), null, 2));
        } else if (sub === 'set') {
          const raw = positional[0];
          if (!raw) {
            console.error('Usage: design-space questions set <json|->');
            process.exit(1);
          }
          const data = parseJsonArg(raw);
          if (data.trigger === undefined) data.trigger = null;
          writeJson(designFile(name, 'questions.json'), data);
          console.log(
            `Wrote designs/${name}/questions.json (no modal — use questions ask to show UI)`,
          );
        } else if (sub === 'ask') {
          cmdQuestionsAsk(name, positional[0]);
        } else if (sub === 'wait') {
          await cmdQuestionsWait(name, timeoutSec);
        } else if (sub === 'dismiss') {
          const prev = readJson(designFile(name, 'questions.json'), null);
          if (prev) {
            writeJson(designFile(name, 'questions.json'), { ...prev, trigger: null });
            console.log(`Dismissed questions UI for designs/${name}`);
          }
        } else {
          console.error('Usage: design-space questions get|set|ask|wait|dismiss');
          process.exit(1);
        }
        break;
      }
      case 'comments': {
        let design;
        const positional = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
          else positional.push(rest[i]);
        }
        const name = design || getActiveName();
        if (sub === 'get') {
          console.log(
            JSON.stringify(readJson(designFile(name, 'comments.json'), { comments: [] }), null, 2),
          );
        } else if (sub === 'resolve') {
          const next = resolveCommentsFs(name, positional);
          console.log(`Resolved ${positional.length || 'all open'} comment(s) on designs/${name}`);
          console.log(JSON.stringify({ comments: next }, null, 2));
        } else if (sub === 'send') {
          const id = positional[0];
          if (!id) {
            console.error('Usage: design-space comments send <commentId>');
            process.exit(1);
          }
          const data = readJson(designFile(name, 'comments.json'), { comments: [] });
          const questions = readJson(designFile(name, 'questions.json'), null);
          const next = data.comments.map((c) =>
            c.id === id ? { ...c, sentToAgent: true, sentAt: new Date().toISOString() } : c,
          );
          persistCommentsBundleFs(name, next, questions);
          appendEventLine(name, { type: 'comment.sent', commentId: id });
          console.log(`Sent comment ${id} to agent inbox`);
        } else {
          console.error('Usage: design-space comments get|resolve|send');
          process.exit(1);
        }
        break;
      }
      case 'inbox': {
        let design;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
        }
        const name = design || getActiveName();
        if (sub === 'get') {
          const inbox = readJson(designFile(name, 'agent-inbox.json'), { comments: [] });
          const md = fs.existsSync(designFile(name, 'agent-inbox.md'))
            ? fs.readFileSync(designFile(name, 'agent-inbox.md'), 'utf8')
            : '';
          console.log(JSON.stringify({ inbox, markdown: md }, null, 2));
        } else {
          console.error('Usage: design-space inbox get');
          process.exit(1);
        }
        break;
      }
      case 'overrides': {
        let design;
        const positional = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
          else positional.push(rest[i]);
        }
        const name = design || getActiveName();
        if (sub === 'get') {
          console.log(
            JSON.stringify(readJson(designFile(name, 'overrides.json'), { byRef: {} }), null, 2),
          );
        } else if (sub === 'set') {
          const raw = positional[0];
          if (!raw) {
            console.error('Usage: design-space overrides set <json|->');
            process.exit(1);
          }
          writeJson(designFile(name, 'overrides.json'), parseJsonArg(raw));
          console.log(`Wrote designs/${name}/overrides.json`);
        } else {
          console.error('Usage: design-space overrides get|set');
          process.exit(1);
        }
        break;
      }
      case 'events': {
        let design;
        let since;
        let limit = 50;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
          else if (rest[i] === '--since') since = rest[++i];
          else if (rest[i] === '--limit') limit = Number(rest[++i]) || 50;
        }
        const name = design || getActiveName();
        if (sub === 'poll') {
          let events = readEvents(name, since || null);
          if (events.length > limit) events = events.slice(-limit);
          console.log(JSON.stringify({ design: name, since: since || null, events }, null, 2));
        } else {
          console.error('Usage: design-space events poll [--since <iso>]');
          process.exit(1);
        }
        break;
      }
      case 'feedback': {
        let design;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
        }
        const name = design || getActiveName();
        if (sub === 'export') {
          console.log(exportAgentFeedback(name));
        } else {
          console.error('Usage: design-space feedback export');
          process.exit(1);
        }
        break;
      }
      case 'tweaks': {
        let design;
        const positional = [];
        for (let i = 0; i < rest.length; i++) {
          if (rest[i] === '--design') design = rest[++i];
          else positional.push(rest[i]);
        }
        const name = design || getActiveName();
        if (sub === 'get') {
          const defaults = readJson(tweaksDefaultsFile(name), {});
          const saved = readJson(tweaksFile(name), {});
          console.log(
            JSON.stringify({ defaults, saved, merged: { ...defaults, ...saved } }, null, 2),
          );
        } else if (sub === 'set') {
          const [key, valueRaw] = positional;
          if (!key || valueRaw === undefined) {
            console.error('Usage: design-space tweaks set <key> <jsonValue>');
            process.exit(1);
          }
          const value = parseJsonArg(valueRaw);
          const saved = readJson(tweaksFile(name), {});
          saved[key] = value;
          writeJson(tweaksFile(name), saved);
          console.log(`Wrote designs/${name}/tweaks.json`);
        } else if (sub === 'merge') {
          const raw = positional[0];
          if (!raw) {
            console.error('Usage: design-space tweaks merge <json|->');
            process.exit(1);
          }
          const patch = parseJsonArg(raw);
          const saved = readJson(tweaksFile(name), {});
          writeJson(tweaksFile(name), { ...saved, ...patch });
          console.log(`Merged into designs/${name}/tweaks.json`);
        } else {
          console.error('Usage: design-space tweaks get|set|merge');
          process.exit(1);
        }
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exit(1);
    }
  })();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
