// Renders the AnswerOnce video deterministically: the composition's GSAP
// timeline is paused and seeked frame by frame, each frame is screenshotted
// with Playwright and piped to ffmpeg, with the generated music bed.
//
//   node video/render.mjs                 # both languages → video/out/answeronce-{en,es}.mp4
//   node video/render.mjs --lang es       # one language
//   node video/render.mjs --stills 3,21.5 # PNG stills at these times → video/.build/stills/
//
// Inputs: video/assets/captures/ (pnpm exec playwright test -c video/playwright.config.ts).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUILD = path.join(ROOT, 'video/.build');
const OUT = path.join(ROOT, 'video/out');
const FPS = 30;

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const langs = (arg('lang') ?? 'en,es').split(',');
const stills = arg('stills')?.split(',').map(Number);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

/** Static server for the repo root (the composition loads brand, landing and capture assets). */
function serve() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openComposition(browser, origin, lang) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`[${lang}] page error:`, e.message));
  await page.goto(`${origin}/video/composition/index.html?lang=${lang}&render`);
  await page.waitForFunction(() => window.__ready !== undefined);
  await page.evaluate(() => window.__ready);
  return page;
}

async function renderVideo(page, lang, duration, music) {
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `answeronce-${lang}.mp4`);
  const frames = Math.round(duration * FPS);
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-i', music,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', '-shortest',
      out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((resolve, reject) => ffmpeg.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.__seek(t), i / FPS);
    const png = await page.screenshot({ type: 'png', animations: 'allow', caret: 'initial' });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`[${lang}] frame ${i}/${frames} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }
  ffmpeg.stdin.end();
  await done;
  console.log(`[${lang}] ${out}`);
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  if (stills) {
    const dir = path.join(BUILD, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const lang of langs) {
      const page = await openComposition(browser, origin, lang);
      // Seek forward through every frame up to each still, like the render does.
      let frame = 0;
      for (const t of [...stills].sort((a, b) => a - b)) {
        const target = Math.round(t * FPS);
        for (; frame <= target; frame++) await page.evaluate((s) => window.__seek(s), frame / FPS);
        const file = path.join(dir, `${lang}-${t.toFixed(2)}.png`);
        await page.screenshot({ path: file });
        console.log(file);
      }
      await page.close();
    }
  } else {
    const probe = await openComposition(browser, origin, langs[0]);
    const duration = await probe.evaluate(() => window.__duration);
    await probe.close();
    const music = path.join(BUILD, 'music.wav');
    fs.mkdirSync(BUILD, { recursive: true });
    const gen = spawnSync('python3', [path.join(ROOT, 'video/music.py'), '--duration', String(duration), '--out', music], { stdio: 'inherit' });
    if (gen.status !== 0) throw new Error('music generation failed');
    for (const lang of langs) {
      const page = await openComposition(browser, origin, lang);
      await renderVideo(page, lang, duration, music);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
