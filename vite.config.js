import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  getRoot,
  isAllowedAppend,
  isAllowedWrite,
  resolveWriteTarget,
} from './lib/design-space-core.mjs';

const ROOT = getRoot();
const DESIGNS = path.join(ROOT, 'designs');

// Loopback only — refuse anything else so `vite --host` can't expose /api/write to the LAN.
const ALLOWED_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) {
    // No Origin header: only non-browser callers reach this. Allow.
    return true;
  }
  try {
    const { hostname } = new URL(origin);
    return ALLOWED_ORIGIN_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function persistPlugin() {
  return {
    name: 'design-space-persist',
    configureServer(server) {
      // Only serve JSON from /designs/* — .jsx must fall through to Vite's
      // module pipeline (serving raw Design.jsx as text/plain breaks imports).
      server.middlewares.use('/designs', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const rel = urlPath.replace(/^\//, '') || 'active.json';
        if (!rel || rel.includes('..')) return next();
        const isJson = rel.endsWith('.json');
        const isMd = rel.endsWith('.md');
        const isJsonl = rel.endsWith('.jsonl');
        if (!isJson && !isMd && !isJsonl) return next();
        const file = path.join(DESIGNS, rel);
        if (!file.startsWith(DESIGNS + path.sep)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
        const ctype = isJson
          ? 'application/json'
          : isJsonl
            ? 'text/plain; charset=utf-8'
            : 'text/markdown; charset=utf-8';
        res.setHeader('Content-Type', ctype);
        res.end(fs.readFileSync(file));
      });

      server.middlewares.use('/api/append', (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!isLoopbackOrigin(req)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { path: relPath, line } = JSON.parse(body);
            if (!relPath || typeof line !== 'string' || !isAllowedAppend(relPath)) {
              res.statusCode = 403;
              res.end('forbidden');
              return;
            }
            const target = resolveWriteTarget(relPath);
            if (!target.startsWith(ROOT + path.sep)) {
              res.statusCode = 403;
              res.end('forbidden');
              return;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.appendFileSync(target, line, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end('error');
          }
        });
      });

      server.middlewares.use('/api/write', (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (!isLoopbackOrigin(req)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const { path: relPath, content } = JSON.parse(body);
            if (!relPath || typeof content !== 'string' || !isAllowedWrite(relPath)) {
              res.statusCode = 403;
              res.end('forbidden');
              return;
            }
            const target = resolveWriteTarget(relPath);
            if (!target.startsWith(ROOT + path.sep)) {
              res.statusCode = 403;
              res.end('forbidden');
              return;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, content, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: relPath }));
          } catch {
            res.statusCode = 500;
            res.end('error');
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), persistPlugin()],
  resolve: {
    alias: {
      '@': path.join(ROOT, 'src'),
    },
  },
  server: {
    fs: { allow: [ROOT] },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.join(ROOT, 'index.html'),
        preview: path.join(ROOT, 'preview.html'),
      },
    },
  },
});
