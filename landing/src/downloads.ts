import { localize, type Locale } from './i18n';

/** The files offered on the install page. Version and sizes are filled in at build time (astro.config.mjs). */
declare const __DOWNLOADS__: { version: string; extensionSize: number; mcpbSize: number };

const facts = __DOWNLOADS__;

/** "2.9 MB", or '' when the file was not there at build time. */
export const formatSize = (bytes: number) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '');

export const downloads = {
  version: facts.version,
  extension: { href: '/downloads/answeronce-chrome.zip', file: 'answeronce-chrome.zip', size: formatSize(facts.extensionSize) },
  mcpb: { href: '/downloads/answeronce.mcpb', file: 'answeronce.mcpb', size: formatSize(facts.mcpbSize) },
};

/** Where every "Install" button points: the tutorial (in the page's locale), which starts the download on arrival. */
export const installHref = (locale: Locale) => localize(locale, '/install/?download=1');
