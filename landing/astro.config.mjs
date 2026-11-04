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

// The site's absolute URL makes canonical, hreflang, Open Graph, sitemap and llms.txt URLs absolute.
// SITE_URL wins; on Netlify, URL (the site's primary URL) is set for every build.
export default defineConfig({
  site: process.env.SITE_URL || process.env.URL || undefined,
  output: 'static',
  // English at /, Spanish at /es/. Strings live in src/i18n/.
  i18n: { defaultLocale: 'en', locales: ['en', 'es'], routing: { prefixDefaultLocale: false } },
  vite: {
    plugins: [tailwindcss()],
    define: { __DOWNLOADS__: JSON.stringify(downloads) },
    // three.js is ~560 kB minified (~140 kB gzipped) in its own lazily loaded chunk.
    build: { chunkSizeWarningLimit: 600 },
  },
});
