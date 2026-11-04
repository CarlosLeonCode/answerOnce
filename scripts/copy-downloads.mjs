// Copies the built extension zip and the Claude Desktop bundle into the landing site under stable
// names, so the install page can link to them: node scripts/copy-downloads.mjs
//   .output/answeronce-<version>-chrome.zip  ->  landing/public/downloads/answeronce-chrome.zip
//   mcp/dist/answeronce.mcpb                 ->  landing/public/downloads/answeronce.mcpb
// Run `pnpm zip` first (it also runs `pnpm build:mcp`); `pnpm landing:downloads` does both.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'landing/public/downloads');
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const files = [
  { from: `.output/answeronce-${version}-chrome.zip`, to: 'answeronce-chrome.zip', hint: 'pnpm zip' },
  { from: 'mcp/dist/answeronce.mcpb', to: 'answeronce.mcpb', hint: 'pnpm build:mcp' },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const f of files) {
  const src = path.join(ROOT, f.from);
  if (!existsSync(src)) {
    console.error(`Missing ${f.from}. Run "${f.hint}" first.`);
    process.exit(1);
  }
  const dest = path.join(OUT_DIR, f.to);
  copyFileSync(src, dest);
  const kb = Math.round(statSync(dest).size / 1024);
  console.log(`${f.from} -> ${path.relative(ROOT, dest)} (${kb} kB)`);
}
