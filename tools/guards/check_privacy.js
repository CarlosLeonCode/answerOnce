/**
 * Project guard: the privacy rules of CONTRIBUTING.md that code can show.
 * In the extension (src/) and the MCP server (mcp/src/): no analytics, telemetry or crash-reporting
 * SDKs or endpoints, and no remote code (remote <script>, importScripts or import() of a URL).
 * In package.json: no analytics or telemetry packages.
 * Whole files are checked, so a violation can never stay in a file once it is touched.
 */
const { changedFiles, readFile } = require('../_changes');
const { report } = require('./lib/lines');

const ROOT = process.cwd();
const CODE = /^(src|mcp\/src)\/.+\.(ts|tsx|js|mjs|cjs|html|json)$/;

const SDK = String.raw`@sentry\/|posthog|mixpanel|@segment\/|analytics-node|@amplitude\/|@datadog\/|logrocket|@fullstory\/|@bugsnag\/|newrelic|react-ga|@vercel\/analytics|firebase`;
const RULES = [
  { re: /google-analytics\.com|googletagmanager\.com|\bgtag\s*\(/, why: 'Google Analytics / Tag Manager' },
  {
    re: /\b(sentry\.io|posthog\.com|mixpanel\.com|segment\.(com|io)|amplitude\.com|hotjar\.com|datadoghq\.(com|eu)|logrocket\.(com|io)|fullstory\.com|bugsnag\.com|nr-data\.net|plausible\.io|clarity\.ms|umami\.is)\b/,
    why: 'analytics or telemetry endpoint',
  },
  { re: new RegExp(String.raw`(from\s+|require\s*\(\s*|import\s*\(\s*)['"\`](${SDK})`), why: 'analytics or telemetry SDK' },
  { re: /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i, why: 'remote script' },
  { re: /\b(importScripts|import)\s*\(\s*['"`]https?:\/\//, why: 'remote code' },
];
const PACKAGE = new RegExp(String.raw`"(${SDK})[^"]*"\s*:`);

const { mode, files } = changedFiles(ROOT);
const violations = [];
for (const file of files) {
  const isPackage = file === 'package.json';
  if (!isPackage && !CODE.test(file)) continue;
  const content = readFile(ROOT, file, mode);
  if (content === null) continue;
  content.split('\n').forEach((text, i) => {
    if (isPackage) {
      if (PACKAGE.test(text)) violations.push({ file, line: i + 1, message: `analytics or telemetry package: ${text.trim()}` });
      return;
    }
    for (const rule of RULES) {
      if (rule.re.test(text)) violations.push({ file, line: i + 1, message: `${rule.why} (CONTRIBUTING.md, privacy rules): ${text.trim().slice(0, 120)}` });
    }
  });
}

report('check_privacy', 'security', violations, 'No analytics, telemetry or remote code');
