import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.xml': 'application/xml', '.woff2': 'font/woff2',
};

/** Dev only: serves the portfolio repo at /site/, so the preview can load the live theme.css, site.js and blog.js.
    In the built editor (blog/editor/) the preview reaches them with relative paths instead. */
function serveSite(): Plugin {
  return {
    name: 'serve-site',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/site', (req, res, next) => {
        const path = normalize(join(repo, decodeURIComponent((req.url ?? '/').split('?')[0])));
        if (!path.startsWith(normalize(repo)) || path.includes('node_modules')) return next();
        try {
          if (!statSync(path).isFile()) return next();
        } catch { return next(); }
        res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
  };
}

// Builds to blog/editor/ with relative URLs, so it works under the Pages sub-path (/aadityagoswami/blog/editor/).
export default defineConfig({
  base: './',
  plugins: [serveSite()],
  build: {
    outDir: fileURLToPath(new URL('../../blog/editor', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // TipTap + ProseMirror are most of the editor; it's a private tool, so one ~200 kB (gzip) bundle is fine
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5178,
    // the editor imports the shared post template from blog/tools/ and the schema from docs/
    fs: { allow: [repo] },
  },
});
