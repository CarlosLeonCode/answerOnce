/**
 * Project guard: SEO and GEO (answer engines and AI assistants) for the landing.
 * Runs when a change touches landing/ and checks the snapshot being committed:
 *  - the layout keeps lang, title, description, canonical, hreflang alternates with x-default,
 *    Open Graph, Twitter card and JSON-LD structured data;
 *  - robots.txt, sitemap.xml and llms.txt are still generated, and robots.txt blocks nothing;
 *  - page titles and descriptions in both dictionaries fit in search results;
 *  - in changed .astro files, every image has alt (alt="" when decorative) and every
 *    target="_blank" link has rel="noopener".
 */
const { changedFiles, readFile } = require('../_changes');
const { report } = require('./lib/lines');

const ROOT = process.cwd();
const LAYOUT = 'landing/src/layouts/Base.astro';
const DICTIONARIES = ['landing/src/i18n/en.ts', 'landing/src/i18n/es.ts'];
const TITLE_MAX = 65;
const DESCRIPTION = { min: 70, max: 160 };

const HEAD = [
  [/<html\s+lang=/, '<html lang>'],
  [/<title>/, '<title>'],
  [/<meta\s+name="description"/, 'meta description'],
  [/rel="canonical"/, 'canonical link'],
  [/hreflang=\{/, 'hreflang alternates'],
  [/hreflang="x-default"/, 'hreflang x-default'],
  [/property="og:title"/, 'og:title'],
  [/property="og:description"/, 'og:description'],
  [/property="og:image"/, 'og:image'],
  [/name="twitter:card"/, 'twitter:card'],
  [/application\/ld\+json/, 'JSON-LD structured data'],
];
const GENERATED = ['robots.txt', 'sitemap.xml', 'llms.txt'];

const { mode, files } = changedFiles(ROOT);
const touched = files.filter((f) => f.startsWith('landing/'));
const violations = [];
const read = (file) => readFile(ROOT, file, mode);

if (touched.length > 0) {
  const layout = read(LAYOUT) || '';
  for (const [re, what] of HEAD) {
    if (!re.test(layout)) violations.push({ file: LAYOUT, message: `missing ${what}` });
  }

  for (const name of GENERATED) {
    const source = read(`landing/src/pages/${name}.ts`) ?? read(`landing/public/${name}`);
    if (source === null) violations.push({ file: `landing/src/pages/${name}.ts`, message: `${name} is no longer generated` });
    else if (name === 'robots.txt' && /Disallow:\s*\/\s*(['"`,\n]|$)/m.test(source)) {
      violations.push({ file: `landing/src/pages/${name}.ts`, message: 'robots.txt blocks the whole site (search engines and AI crawlers)' });
    }
  }

  // String values in the dictionaries: 'text', with \' escapes.
  const str = String.raw`'((?:[^'\\]|\\.)*)'`;
  const fields = [
    ['meta.title', new RegExp(String.raw`meta:\s*\{\s*title:\s*${str}`)],
    ['meta.description', new RegExp(String.raw`meta:\s*\{[^}]*?description:\s*${str}`)],
    ['guide.pageTitle', new RegExp(String.raw`pageTitle:\s*${str}`)],
    ['guide.pageDescription', new RegExp(String.raw`pageDescription:\s*${str}`)],
  ];
  for (const file of DICTIONARIES) {
    const text = read(file);
    if (text === null) continue;
    for (const [key, re] of fields) {
      const value = text.match(re)?.[1];
      if (value === undefined) {
        violations.push({ file, message: `${key} not found` });
        continue;
      }
      const length = [...value].length;
      if (key.endsWith('itle') && length > TITLE_MAX) violations.push({ file, message: `${key} is ${length} characters (max ${TITLE_MAX})` });
      if (key.endsWith('escription') && (length < DESCRIPTION.min || length > DESCRIPTION.max)) {
        violations.push({ file, message: `${key} is ${length} characters (keep it ${DESCRIPTION.min}–${DESCRIPTION.max})` });
      }
    }
  }

  for (const file of touched.filter((f) => f.endsWith('.astro'))) {
    const text = read(file);
    if (text === null) continue;
    const lineOf = (index) => text.slice(0, index).split('\n').length;
    for (const m of text.matchAll(/<(img|Image|Shot)\b(?![^>]*\balt\s*=)[^>]*>/g)) {
      violations.push({ file, line: lineOf(m.index), message: `<${m[1]}> without alt (use alt="" when it is decorative)` });
    }
    for (const m of text.matchAll(/<a\b(?=[^>]*target="_blank")(?![^>]*\brel="[^"]*noopener)[^>]*>/g)) {
      violations.push({ file, line: lineOf(m.index), message: 'target="_blank" link without rel="noopener"' });
    }
  }
}

report('check_seo_geo', 'correctness', violations, touched.length ? 'SEO and GEO basics in place' : 'No landing files in this change');
