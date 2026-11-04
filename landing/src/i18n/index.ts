/**
 * Locales and helpers. English lives at `/`, Spanish at `/es/` (astro.config.mjs `i18n`).
 * Components call `useStrings(Astro.currentLocale)` and build links with `localize(locale, path)`.
 */
import { en, type Strings } from './en';
import { es } from './es';

export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

const dictionaries: Record<Locale, Strings> = { en, es };

export const toLocale = (value: string | undefined): Locale => (locales as readonly string[]).includes(value ?? '') ? (value as Locale) : defaultLocale;

export const useStrings = (locale: string | undefined): Strings => dictionaries[toLocale(locale)];

/** `/install/` → `/es/install/` for Spanish; unchanged for English. `path` must start with `/`. */
export const localize = (locale: Locale, path: string): string => (locale === defaultLocale ? path : `/${locale}${path}`);

/** The locale-neutral path of a URL pathname: `/es/install/` → `/install/`. */
export const basePath = (pathname: string): string => {
  const match = pathname.match(/^\/(es)(\/.*)?$/);
  const rest = match ? match[2] || '/' : pathname;
  return rest.endsWith('/') ? rest : `${rest}/`;
};

/** The same page in another locale. */
export const switchLocale = (pathname: string, target: Locale): string => localize(target, basePath(pathname));

/** Language tag and Open Graph locale for each locale. */
export const localeMeta: Record<Locale, { lang: string; og: string; label: string; name: string }> = {
  en: { lang: 'en', og: 'en_US', label: 'EN', name: 'English' },
  es: { lang: 'es', og: 'es_ES', label: 'ES', name: 'Español' },
};

/**
 * Rich text: a string, or segments where `{ b: 'edge', t: '…' }` shows only for those browsers on
 * the install guide (see For.astro). Inside a string, **bold** and `code` are formatted and {name}
 * is replaced from `vars`.
 */
export type Seg = string | { b: string; t: string };
export type Rich = string | Seg[];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function richHtml(text: string, vars: Record<string, string | number> = {}): string {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="kbd">$1</code>')
    .replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? escape(String(vars[key])) : all));
}

/** Plain-text interpolation: fmt('{n} of {total}', { n: 1, total: 8 }). */
export const fmt = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? String(vars[key]) : all));

export type { Strings };
