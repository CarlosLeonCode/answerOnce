/**
 * Project guard: a responsive, mobile-first landing (landing/src).
 * Lines a change adds must:
 *  - use min-width breakpoints: no `@media (max-width: …)` without a min-width, no Tailwind `max-*:` variants;
 *  - avoid fixed widths of 480px (30rem) or more (`width: 640px`, `min-width: 600px`, `w-[640px]`): they overflow phones;
 *  - avoid `width: 100vw`, which ignores the scrollbar and adds a horizontal scroll;
 *  - keep pinch-zoom (no `user-scalable=no`, no `maximum-scale=1`).
 * The layout must keep `<meta name="viewport" content="width=device-width…">`.
 * Lines already in the code base are not judged, only the ones the change adds.
 */
const { changedFiles, readFile } = require('../_changes');
const { addedLines, report } = require('./lib/lines');

const ROOT = process.cwd();
const SCOPE = /^landing\/src\/.+\.(css|astro|tsx|jsx|html)$/;
const LAYOUT = 'landing/src/layouts/Base.astro';
const LIMIT_PX = 480;

const px = (value, unit) => Number(value) * (unit === 'px' ? 1 : 16);
const checks = [
  {
    test: (t) => /@media[^{]*\(\s*max-width\s*:/i.test(t) && !/min-width/i.test(t),
    why: 'desktop-first breakpoint: style the phone first and add `@media (min-width: …)`',
  },
  {
    test: (t) => /(^|[\s"'`{(])max-(sm|md|lg|xl|2xl|\[[^\]]+\]):/.test(t),
    why: 'Tailwind `max-*:` variant: style the phone first and use `sm:`, `md:`, `min-[…]:`',
  },
  {
    test: (t) =>
      !/@media|matchMedia/.test(t) &&
      ([...t.matchAll(/(^|[^\w(-])(min-)?width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)\b/g)].some((m) => px(m[3], m[4]) >= LIMIT_PX) ||
      [...t.matchAll(/(^|[^\w-])(min-)?w-\[(\d+(?:\.\d+)?)(px|rem)\]/g)].some((m) => px(m[3], m[4]) >= LIMIT_PX)),
    why: `fixed width of ${LIMIT_PX}px or more: use max-width, %, or a width that stops at the screen`,
  },
  { test: (t) => /(^|[^-])width\s*:\s*100vw/.test(t), why: '`width: 100vw` adds a horizontal scroll: use 100%' },
  { test: (t) => /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(t), why: 'zoom disabled: people must be able to pinch-zoom' },
];

const { mode, files } = changedFiles(ROOT);
const inScope = files.filter((f) => SCOPE.test(f));
const violations = [];
for (const file of inScope) {
  for (const { line, text } of addedLines(ROOT, file, mode)) {
    for (const check of checks) {
      if (check.test(text)) violations.push({ file, line, message: `${check.why}: ${text.trim().slice(0, 120)}` });
    }
  }
}
if (inScope.length > 0) {
  const layout = readFile(ROOT, LAYOUT, mode) || '';
  if (!/<meta\s+name="viewport"\s+content="[^"]*width=device-width/.test(layout)) {
    violations.push({ file: LAYOUT, message: 'missing <meta name="viewport" content="width=device-width, initial-scale=1">' });
  }
}

report('check_responsive', 'correctness', violations, inScope.length ? 'Mobile-first rules respected' : 'No landing UI files in this change');
