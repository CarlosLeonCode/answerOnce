import type { APIRoute } from 'astro';

/** Everything is public, for search engines and AI crawlers alike (GEO). */
export const GET: APIRoute = ({ site }) =>
  new Response(['User-agent: *', 'Allow: /', ...(site ? ['', `Sitemap: ${new URL('/sitemap.xml', site).href}`] : [])].join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
