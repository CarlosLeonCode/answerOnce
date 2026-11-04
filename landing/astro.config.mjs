// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * Facts about the downloadable files, read at build time for the install page. The files are copied
 * into public/downloads by `pnpm landing:downloads` at the repository root (`pnpm landing:build` runs
 * it before this build). A missing file gets size 0 and the page leaves the size out.
 */
const root = new URL('../', import.meta.url);
const sizeOf = (/** @type {string} */ name) => {
  const file = new URL(`public/downloads/${name}`, import.meta.url);
  return existsSync(file) ? statSync(file).size : 0;
};
const downloads = {
  version: JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version,
  extensionSize: sizeOf('answeronce-chrome.zip'),
  mcpbSize: sizeOf('answeronce.mcpb'),
};
if (!downloads.extensionSize) console.warn('[downloads] public/downloads/answeronce-chrome.zip is missing: run `pnpm landing:build` from the repository root.');

// Set SITE_URL at build time (e.g. SITE_URL=https://answeronce.example.com pnpm build)
// so canonical and Open Graph URLs are absolute.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
    define: { __DOWNLOADS__: JSON.stringify(downloads) },
    // three.js is ~560 kB minified (~140 kB gzipped) in its own lazily loaded chunk.
    build: { chunkSizeWarningLimit: 600 },
  },
});
