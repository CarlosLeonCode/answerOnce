import type { APIRoute } from 'astro';
import { locales, localize, localeMeta } from '../i18n';

/** Every page in every locale, with its hreflang alternates. Needs `site` (astro.config.mjs) for absolute URLs. */
const pages = ['/', '/install/'];

export const GET: APIRoute = ({ site }) => {
  const abs = (path: string) => (site ? new URL(path, site).href : path);
  const urls = pages.flatMap((page) =>
    locales.map((locale) => {
      const alternates = locales
        .map((l) => `    <xhtml:link rel="alternate" hreflang="${localeMeta[l].lang}" href="${abs(localize(l, page))}"/>`)
        .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(page)}"/>`);
      return [`  <url>`, `    <loc>${abs(localize(locale, page))}</loc>`, ...alternates, `  </url>`].join('\n');
    }),
  );
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
  ].join('\n');
  return new Response(xml + '\n', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
