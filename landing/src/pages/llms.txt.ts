import type { APIRoute } from 'astro';
import { localize, useStrings } from '../i18n';
import { site as siteInfo } from '../site';

/**
 * llms.txt (https://llmstxt.org): a plain summary of the site for AI assistants and answer engines.
 * Built from the same strings as the pages, so it never says more than they do.
 */
export const GET: APIRoute = ({ site }) => {
  const abs = (path: string) => (site ? new URL(path, site).href : path);
  const en = useStrings('en');
  const es = useStrings('es');
  const lines = [
    `# ${siteInfo.name}`,
    '',
    `> ${en.meta.description}`,
    '',
    en.hero.lead,
    '',
    '## Pages',
    '',
    `- [${en.meta.title}](${abs('/')}): ${en.meta.description}`,
    `- [${en.guide.pageTitle}](${abs('/install/')}): ${en.guide.pageDescription}`,
    '',
    '## Español',
    '',
    `- [${es.meta.title}](${abs(localize('es', '/'))}): ${es.meta.description}`,
    `- [${es.guide.pageTitle}](${abs(localize('es', '/install/'))}): ${es.guide.pageDescription}`,
    ...(siteInfo.repoUrl ? ['', '## Source', '', `- [Source code (AGPL-3.0)](${siteInfo.repoUrl})`] : []),
  ];
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
