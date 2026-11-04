/* global gsap */
import { FORM_LABELS, STRINGS } from './strings.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'es' ? 'es' : 'en';
const RENDER = params.has('render');
const T = STRINGS[lang];
document.documentElement.lang = lang;
if (RENDER) document.body.classList.add('render');

const W = 1920;
const H = 1080;
const M = 96; // safe margin
const CAPTURES = '../assets/captures/';
const LOGO = '/brand/answeronce-icon.svg';
const layout = await fetch(`${CAPTURES}layout.json`).then((r) => r.json());
const agentSvgs = Object.fromEntries(
  await Promise.all(
    ['claude', 'codex', 'antigravity', 'opencode', 'cursor'].map(async (name) => {
      const svg = await fetch(`/landing/src/assets/agents/${name}.svg`).then((r) => r.text());
      return [name, svg.replace(/<title>.*?<\/title>/, '').replace(/ (height|width|style)="[^"]*"/g, '')];
    }),
  ),
);

// Text widths are measured while building the timeline: load the font first.
await Promise.all(['450 40px "Inter Variable"', '600 40px "Inter Variable"'].map((f) => document.fonts.load(f)));

const stage = document.getElementById('stage');
const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
function el(tag, className, parent, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}
function place(node, x, y, w, h) {
  Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
  if (w !== undefined) node.style.width = `${w}px`;
  if (h !== undefined) node.style.height = `${h}px`;
  return node;
}
const icon = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;
const ICONS = {
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  json: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
  userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  serverOff: '<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"/><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z"/><path d="M22 17v-1a2 2 0 0 0-2-2h-1"/><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z"/><path d="M6 18h.01"/><path d="m2 2 20 20"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
};
const CURSOR_SVG =
  '<svg viewBox="0 0 24 32"><path d="M2.5 2.5 L2.5 25.5 L8.6 19.7 L12.9 29 L16.5 27.4 L12.3 18.3 L20.6 18.3 Z" fill="#111114" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/** A block of text lines positioned on the stage. Each entry: [className, html]. */
function textBlock(parent, { x, y, w, align = 'left' }, lines) {
  const block = place(el('div', `abs ${align === 'center' ? 'center' : ''}`, parent), x, y, w);
  return lines.map(([cls, html]) => el('div', `line ${cls}`, block, html));
}

/** Browser window with a 1280×860 capture viewport, scaled to `width`. */
function browser(parent, { x, y, width, url, ext = true }) {
  const k = width / 1280;
  const sh = Math.round(860 * k);
  const root = place(el('div', 'browser', parent), x, y, width, sh + 52);
  const bar = el('div', 'bar', root);
  el('div', 'dots', bar, '<i></i><i></i><i></i>');
  el('div', 'url', bar, url);
  const extBox = el('div', 'ext', bar, ext ? `<img src="${LOGO}" alt="">` : '');
  const screen = el('div', 'screen', root);
  screen.style.height = `${sh}px`;
  const cam = el('div', 'cam', screen);
  gsap.set(cam, { scale: k, x: 0, y: 0 });
  const overlay = el('div', 'abs', root); // cursor layer, in browser coordinates
  Object.assign(overlay.style, { inset: '0', pointerEvents: 'none' });
  return { root, cam, screen, overlay, extBox, k, sw: width, sh, x, y, width };
}
function shot(b, name, opacity = 1) {
  const img = el('img', 'shot', b.cam);
  img.src = `${CAPTURES}${name}.png`;
  gsap.set(img, { opacity });
  return img;
}
const lock = icon(ICONS.lock, 'style="width:15px;height:15px;color:#71717a"');

/** Camera framing (fx, fy) at zoom z, inside a view of the screen (default: whole screen). */
function cam(b, fx, fy, z, view = {}) {
  const s = b.k * z;
  const vh = view.h ?? b.sh;
  let x = b.sw / 2 - fx * s;
  let y = vh / 2 - fy * s;
  x = Math.min(0, Math.max(b.sw - 1280 * s, x));
  y = Math.min(0, Math.max(vh - 860 * s, y));
  return { x, y, scale: s };
}
/** Image point → browser-root point under a camera framing. */
function toBrowser(c, ix, iy) {
  return { x: c.x + ix * c.scale, y: 52 + c.y + iy * c.scale };
}
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

function cursor(parent, who) {
  const node = el('div', 'cursor', parent, CURSOR_SVG + (who ? `<span class="who">${who}</span>` : ''));
  gsap.set(node, { opacity: 0, x: 0, y: 0, xPercent: -8, yPercent: -6 });
  return node;
}
function click(parent, at, p) {
  const r = el('div', 'ripple', parent);
  gsap.set(r, { x: p.x, y: p.y, scale: 0, opacity: 0 });
  tl.fromTo(r, { scale: 0.2, opacity: 0.9 }, { scale: 1.5, opacity: 0, duration: 0.7, ease: 'power2.out', immediateRender: false }, at);
}
function press(node, at) {
  tl.to(node, { scale: 0.86, duration: 0.1, ease: 'power2.out', transformOrigin: '8% 6%' }, at - 0.1).to(node, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.02);
}

// Text in and out
const IN = { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.0, ease: 'power3.out' };
function reveal(nodes, at, stagger = 0.12, from = 32) {
  tl.fromTo(nodes, { opacity: 0, y: from, filter: 'blur(10px)' }, { ...IN, stagger }, at);
}
function hide(nodes, at, stagger = 0.04) {
  tl.to(nodes, { opacity: 0, y: -18, filter: 'blur(8px)', duration: 0.5, ease: 'power2.in', stagger }, at);
}
function frameIn(node, at, dy = 70) {
  tl.fromTo(node, { opacity: 0, y: dy, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 1.4, ease: 'expo.out' }, at);
}
function frameOut(node, at, dy = -30) {
  tl.to(node, { opacity: 0, y: dy, scale: 0.99, duration: 0.6, ease: 'power2.in' }, at);
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------
const bg = el('div', 'scene', stage);
const blobA = el('div', 'blob a', bg);
const blobB = el('div', 'blob b', bg);
const blobC = el('div', 'blob c', bg);

// Scene timing (seconds)
const S = { problem: 0, logo: 6.6, import: 11.8, fill: 19.8, draft: 29.3, submit: 34.3, track: 39.8, agents: 46.3, privacy: 54.3, end: 59.3, total: 64.5 };

tl.fromTo(blobA, { x: 0, y: 0 }, { x: 520, y: 260, duration: S.total, ease: 'sine.inOut' }, 0);
tl.fromTo(blobB, { x: 0, y: 0 }, { x: -620, y: -120, duration: S.total, ease: 'sine.inOut' }, 0);
tl.fromTo(blobC, { opacity: 0.4, scale: 0.8 }, { opacity: 1, scale: 1.15, duration: S.total, ease: 'sine.inOut' }, 0);

// ---------------------------------------------------------------------------
// 1 · The problem: the same fields, worded differently
// ---------------------------------------------------------------------------
{
  const t0 = S.problem;
  const scene = el('div', 'scene', stage);
  const rows = [
    { y: 54, xs: [-40, 420, 900, 1380], ws: [400, 420, 400, 440] },
    { y: 232, xs: [140, 640, 1150, 1600], ws: [420, 430, 400, 420] },
    { y: 712, xs: [-20, 470, 940, 1440], ws: [420, 410, 440, 420] },
    { y: 890, xs: [200, 700, 1180, 1660], ws: [420, 400, 420, 400] },
  ];
  const cards = [];
  let i = 0;
  for (const row of rows) {
    row.xs.forEach((x, j) => {
      const f = FORM_LABELS[i % FORM_LABELS.length];
      const card = place(el('div', 'fcard', scene), x, row.y + (j % 2 ? 14 : 0), row.ws[j]);
      el('div', 'lbl', card, f.label);
      const inp = el('div', 'inp', card);
      let typed = null;
      if (f.file) inp.innerHTML = `<span class="filebtn">Choose file</span><span class="muted">No file chosen</span>`;
      else if (f.select) inp.innerHTML = `<span class="muted">Select…</span>${icon(ICONS.chevron, 'class="chev"')}`;
      else if (f.typed) {
        typed = el('span', 'typed', inp, f.typed);
        el('span', 'caret', inp);
      } else el('span', 'caret', inp);
      gsap.set(card, { rotation: ((i * 37) % 7) - 3 > 0 ? 0.8 : -0.8 });
      cards.push({ card, typed, x, y: row.y, w: row.ws[j] });
      i++;
    });
  }
  const spot = el('div', 'spot', scene);
  const [dim, strong] = textBlock(scene, { x: M + 40, y: 0, w: W - 2 * M - 80, align: 'center' }, [
    ['body dim', T.problemDim],
    ['title xl', T.problem],
  ]);
  dim.parentElement.style.top = '0px';
  // Vertically center the headline block.
  const block = dim.parentElement;
  Object.assign(block.style, { top: '50%', transform: 'translateY(-50%)' });
  dim.style.fontSize = '44px';
  dim.style.marginBottom = '18px';
  dim.style.fontWeight = '520';

  tl.set(scene, { opacity: 1 }, 0);
  // Cards appear, scattered in time.
  const order = cards.map((c, n) => ({ c, d: ((n * 7) % 16) / 16 }));
  for (const { c, d } of order) {
    tl.fromTo(c.card, { opacity: 0, y: 26, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'expo.out' }, t0 + 0.15 + d * 1.6);
    if (c.typed) {
      const w = c.typed.scrollWidth || 200;
      tl.fromTo(c.typed, { width: 0 }, { width: w + 2, duration: 0.07 * c.typed.textContent.length, ease: `steps(${c.typed.textContent.length})` }, t0 + 0.7 + d * 1.6);
    }
    tl.to(c.card, { y: -22 - d * 18, duration: 6.6, ease: 'none' }, t0 + 0.15 + d * 1.6 + 0.9);
  }
  tl.fromTo(spot, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' }, t0 + 1.0);
  tl.to(cards.map((c) => c.card), { opacity: 0.42, duration: 1.0, ease: 'power2.out' }, t0 + 1.9);
  reveal([dim], t0 + 0.9);
  reveal([strong], t0 + 2.0);
  // Exit: the fields converge to the center, where the logo appears.
  hide([dim, strong], S.logo - 0.6);
  for (const [n, c] of cards.entries()) {
    const dx = W / 2 - (c.x + c.w / 2);
    const dy = H / 2 - (c.y + 60);
    tl.to(c.card, { x: dx * 0.92, y: `+=${dy * 0.92}`, scale: 0.18, opacity: 0, duration: 0.85, ease: 'power3.in' }, S.logo - 0.65 + (n % 5) * 0.025);
  }
  tl.to(spot, { opacity: 0, duration: 0.5 }, S.logo - 0.4);
  tl.set(scene, { opacity: 0 }, S.logo + 0.4);
}

// ---------------------------------------------------------------------------
// 2 · Logo and tagline
// ---------------------------------------------------------------------------
{
  const t0 = S.logo;
  const scene = el('div', 'scene', stage);
  const size = 188;
  const top = 254;
  const glow = place(el('div', 'glow', scene), W / 2 - 330, top - 330 + size / 2, 660, 660);
  const logo = el('img', 'logo abs', scene);
  logo.src = LOGO;
  place(logo, W / 2 - size / 2, top, size, size);
  const lines = textBlock(scene, { x: M, y: top + 238, w: W - 2 * M, align: 'center' }, [
    ['title xl dim', T.tagDim],
    ['title xl', T.tag],
    ['body', T.intro],
  ]);
  lines[2].style.margin = '34px auto 0';
  lines[2].style.maxWidth = '1240px';

  tl.fromTo(glow, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 1.6, ease: 'expo.out' }, t0);
  tl.fromTo(logo, { opacity: 0, scale: 0.55, rotation: -8, y: 30 }, { opacity: 1, scale: 1, rotation: 0, y: 0, duration: 1.3, ease: 'expo.out' }, t0 + 0.05);
  reveal([lines[0], lines[1]], t0 + 0.55, 0.22, 40);
  reveal([lines[2]], t0 + 1.5);
  tl.to(glow, { scale: 1.12, duration: 4, ease: 'sine.inOut' }, t0 + 1.6);
  hide([lines[0], lines[1], lines[2]], S.import - 0.55);
  tl.to([logo, glow], { opacity: 0, scale: 0.9, duration: 0.55, ease: 'power2.in' }, S.import - 0.55);
}

// ---------------------------------------------------------------------------
// 3 · Import your CV → review
// ---------------------------------------------------------------------------
{
  const t0 = S.import;
  const scene = el('div', 'scene', stage);
  const b = browser(scene, { x: W - M - 940, y: 194, width: 940, url: `<img src="${LOGO}" alt="">AnswerOnce · Import from CV` });
  shot(b, 'import-review');
  const importTitle = `<span class="dim">${T.importDim}</span><br>${T.import}`;
  const [title, bodyA] = textBlock(scene, { x: M, y: 360, w: 740 }, [
    ['title', importTitle],
    ['body', T.importA],
  ]);
  bodyA.style.marginTop = '34px';
  const bodyB = textBlock(scene, { x: M, y: 360, w: 740 }, [['title', importTitle], ['body', T.importB]]);
  bodyB[0].style.visibility = 'hidden';
  bodyB[1].style.marginTop = '34px';
  gsap.set([bodyA, bodyB[1]], { opacity: 0 });
  // A CV file joins the frame.
  const doc = place(el('div', 'doc', scene, '<i class="h"></i><i></i><i></i><i style="width:80%"></i><i></i><i style="width:60%"></i><span class="tag">PDF</span><span class="name">sample-cv.pdf</span>'), b.x - 36, 590);

  tl.set(scene, { opacity: 1 }, t0);
  reveal([title], t0 + 0.05);
  frameIn(b.root, t0 + 0.2);
  reveal([bodyA], t0 + 1.0);
  tl.fromTo(doc, { opacity: 0, x: -120, rotation: -10 }, { opacity: 1, x: 0, rotation: -4, duration: 1.2, ease: 'expo.out' }, t0 + 0.6);
  tl.to(doc, { x: 260, y: -160, scale: 0.4, rotation: 0, opacity: 0, duration: 0.9, ease: 'power3.in' }, t0 + 2.2);

  const L = layout['import-review'];
  const c1 = cam(b, 640, 500, 1.55);
  tl.to(b.cam, { ...c1, duration: 1.8, ease: 'power3.inOut' }, t0 + 2.3);
  hide([bodyA], t0 + 4.2);
  reveal([bodyB[1]], t0 + 4.55);
  const saveC = center(L.save);
  const c2 = cam(b, saveC.x - 120, saveC.y - 40, 1.6);
  tl.to(b.cam, { ...c2, duration: 1.6, ease: 'power3.inOut' }, t0 + 4.4);
  const cur = cursor(b.overlay);
  const p = toBrowser(c2, saveC.x, saveC.y);
  tl.fromTo(cur, { opacity: 0, x: p.x - 260, y: p.y + 200 }, { opacity: 1, duration: 0.3, ease: 'none' }, t0 + 5.2);
  tl.to(cur, { x: p.x, y: p.y, duration: 1.0, ease: 'power3.inOut' }, t0 + 5.3);
  press(cur, t0 + 6.45);
  click(b.overlay, t0 + 6.4, p);
  hide([title, bodyB[1]], t0 + 7.45);
  frameOut(b.root, t0 + 7.4);
  tl.to(cur, { opacity: 0, duration: 0.3 }, t0 + 7.3);
  tl.set(scene, { opacity: 0 }, t0 + 8.1);
}

// ---------------------------------------------------------------------------
// 4 + 5 · Fill in one click, AI drafts, you submit (one continuous browser)
// ---------------------------------------------------------------------------
{
  const t0 = S.fill;
  const scene = el('div', 'scene', stage);
  const FW = 1400;
  const b = browser(scene, { x: (W - FW) / 2, y: 318, width: FW, url: `${lock}careers.fieldstone.example/jobs/senior-frontend-engineer` });
  const view = { h: H - 318 - 52 };
  const empty = shot(b, 'job-empty');
  // The in-page panel, cropped from the capture where it is open.
  const ov = layout['overlay-before'].overlay;
  const panel = shot(b, 'overlay-before', 0);
  panel.style.clipPath = `inset(${ov.y - 2}px ${1280 - ov.x - ov.width - 4}px ${860 - ov.y - ov.height - 8}px ${ov.x - 4}px round 14px)`;
  const after = shot(b, 'overlay-after', 0);
  const question = shot(b, 'overlay-question', 0);
  const draft = shot(b, 'overlay-draft', 0);
  const inserted = shot(b, 'overlay-inserted', 0);
  // Draft text appears line by line (a cover over the textarea, removed top-down).
  const ans = layout['overlay-draft'].answer;
  const cover = place(el('div', 'abs', b.cam), ans.x + 2, ans.y + 2, ans.width - 4, ans.height - 4);
  Object.assign(cover.style, { background: '#fff', borderRadius: '6px', opacity: 0 });
  // Consent ring on the inserted page.
  const consent = layout['overlay-inserted'].consent;
  const ring = place(el('div', 'ring', b.cam), consent.x - 8, consent.y - 8, 560, consent.height + 16);
  gsap.set(ring, { opacity: 0 });

  const headline = (dimText, text) => textBlock(scene, { x: M, y: 92, w: W - 2 * M, align: 'center' }, [['title', `<span class="dim">${dimText}</span> ${text}`]])[0];
  const sub = (text) => textBlock(scene, { x: M, y: 196, w: W - 2 * M, align: 'center' }, [['body', text]])[0];
  const fillTitle = headline(T.fillDim, T.fill);
  const fillA = sub(T.fillA);
  const fillB = sub(T.fillB);
  const draftTitle = headline(T.draftDim, T.draft);
  const draftA = sub(T.draftA);
  const submitTitle = headline(T.submitDim, T.submit);
  const submitA = sub(T.submitA);
  gsap.set([fillTitle, fillA, fillB, draftTitle, draftA, submitTitle, submitA], { opacity: 0 });

  const cur = cursor(b.overlay);
  const you = cursor(b.overlay, T.you);

  tl.set(scene, { opacity: 1 }, t0);
  reveal([fillTitle], t0 + 0.05);
  frameIn(b.root, t0 + 0.25, 120);
  reveal([fillA], t0 + 0.8);

  // Toolbar click opens the panel.
  const c0 = { x: 0, y: 0, scale: b.k };
  const extP = { x: b.width - 18 - 17, y: 26 };
  tl.fromTo(cur, { opacity: 0, x: b.width - 300, y: 420 }, { opacity: 1, duration: 0.3, ease: 'none' }, t0 + 1.4);
  tl.to(cur, { x: extP.x, y: extP.y, duration: 1.0, ease: 'power3.inOut' }, t0 + 1.45);
  press(cur, t0 + 2.55);
  click(b.overlay, t0 + 2.5, extP);
  tl.fromTo(panel, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' }, t0 + 2.6);

  // Fill this page.
  const fillP = toBrowser(c0, center(layout['overlay-before'].fill).x, center(layout['overlay-before'].fill).y);
  tl.to(cur, { x: fillP.x, y: fillP.y, duration: 0.95, ease: 'power3.inOut' }, t0 + 3.4);
  press(cur, t0 + 4.5);
  click(b.overlay, t0 + 4.45, fillP);
  tl.set(after, { opacity: 1, clipPath: 'inset(0px 0px 100% 0px)' }, t0 + 4.55);
  tl.to(after, { clipPath: 'inset(0px 0px 0% 0px)', duration: 1.1, ease: 'power2.inOut' }, t0 + 4.55);
  tl.set([empty, panel], { opacity: 0 }, t0 + 5.7);
  tl.to(cur, { opacity: 0, duration: 0.3 }, t0 + 5.0);

  hide([fillA], t0 + 5.3);
  reveal([fillB], t0 + 5.65);
  tl.to(b.cam, { ...cam(b, 410, 520, 1.32, view), duration: 1.5, ease: 'power3.inOut' }, t0 + 5.7);
  tl.to(b.cam, { ...cam(b, 1067, 505, 1.55, view), duration: 1.5, ease: 'power3.inOut' }, t0 + 7.4);
  hide([fillTitle, fillB], t0 + 9.0);

  // AI drafts the open question.
  const d0 = S.draft;
  reveal([draftTitle], d0 + 0.05);
  reveal([draftA], d0 + 0.45);
  const qc = cam(b, 1067, 372, 1.75, view);
  tl.to(question, { opacity: 1, duration: 0.6, ease: 'power1.inOut' }, d0);
  tl.set(after, { opacity: 0 }, d0 + 0.65);
  tl.to(b.cam, { ...qc, duration: 1.3, ease: 'power3.inOut' }, d0);
  const genQ = center(layout['overlay-question'].generate);
  const genP = toBrowser(qc, genQ.x, genQ.y);
  tl.fromTo(cur, { opacity: 0, x: genP.x + 260, y: genP.y + 160 }, { opacity: 1, duration: 0.3, ease: 'none' }, d0 + 1.0);
  tl.to(cur, { x: genP.x, y: genP.y, duration: 0.85, ease: 'power3.inOut' }, d0 + 1.05);
  press(cur, d0 + 2.0);
  click(b.overlay, d0 + 1.95, genP);
  // The panel content scrolls by the draft's height difference.
  const shift = layout['overlay-question'].answer.y - layout['overlay-draft'].answer.y;
  tl.set(cover, { opacity: 1, clipPath: 'inset(0% 0px 0px 0px)' }, d0 + 2.1);
  tl.fromTo(draft, { opacity: 0, y: shift }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.inOut' }, d0 + 2.1);
  tl.fromTo(cover, { y: shift }, { y: 0, duration: 0.6, ease: 'power2.inOut' }, d0 + 2.1);
  tl.to(question, { y: -shift, opacity: 0, duration: 0.6, ease: 'power2.inOut' }, d0 + 2.1);
  tl.to(cover, { clipPath: 'inset(100% 0px 0px 0px)', duration: 1.3, ease: 'steps(5)' }, d0 + 2.7);
  const ins = center(layout['overlay-draft'].insert);
  const insP = toBrowser(qc, ins.x, ins.y);
  tl.to(cur, { x: insP.x, y: insP.y, duration: 0.8, ease: 'power3.inOut' }, d0 + 3.2);
  press(cur, d0 + 4.1);
  click(b.overlay, d0 + 4.05, insP);
  hide([draftTitle, draftA], d0 + 4.5);

  // The answer is on the page; consent and Submit stay with the user.
  const s0 = S.submit;
  tl.to(cur, { opacity: 0, duration: 0.3 }, s0);
  tl.to(inserted, { opacity: 1, duration: 0.8, ease: 'power1.inOut' }, s0);
  tl.set([draft, cover, question], { opacity: 0 }, s0 + 0.85);
  const sc = cam(b, 400, 650, 1.32, view);
  tl.to(b.cam, { ...sc, duration: 1.5, ease: 'power3.inOut' }, s0);
  reveal([submitTitle], s0 + 0.2);
  reveal([submitA], s0 + 0.65);
  tl.fromTo(ring, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, s0 + 1.6);
  const submitR = layout['overlay-inserted'].submit;
  const submitC = { x: submitR.x + submitR.width * 0.8, y: submitR.y + submitR.height * 0.62 };
  const subP = toBrowser(sc, submitC.x, submitC.y);
  tl.fromTo(you, { opacity: 0, x: subP.x + 420, y: subP.y + 60 }, { opacity: 1, duration: 0.3, ease: 'none' }, s0 + 2.4);
  tl.to(you, { x: subP.x, y: subP.y, duration: 1.1, ease: 'power3.inOut' }, s0 + 2.45);
  press(you, s0 + 3.75);
  click(b.overlay, s0 + 3.7, subP);
  hide([submitTitle, submitA], s0 + 4.95);
  tl.to([you, ring], { opacity: 0, duration: 0.3 }, s0 + 4.8);
  frameOut(b.root, s0 + 4.9, 40);
  tl.set(scene, { opacity: 0 }, S.track + 0.1);
}

// ---------------------------------------------------------------------------
// 6 · Track every application
// ---------------------------------------------------------------------------
{
  const t0 = S.track;
  const scene = el('div', 'scene', stage);
  const b = browser(scene, { x: M, y: 178, width: 1000, url: `<img src="${LOGO}" alt="">AnswerOnce · Applications` });
  shot(b, 'applications');
  const [title, body] = textBlock(scene, { x: M + 1000 + 64, y: 380, w: W - 2 * M - 1000 - 64 }, [
    ['title', `<span class="dim">${T.trackDim}</span><br>${T.track}`],
    ['body', T.trackA],
  ]);
  body.style.marginTop = '34px';
  // The "Already applied" warning from the panel.
  const wr = layout['panel-already-applied'].warning;
  const s = 1.55;
  const warn = place(el('div', 'crop', scene), M + 1000 - wr.width * s + 70, 178 + 724 - 70, (wr.width + 12) * s, (wr.height + 12) * s);
  Object.assign(warn.style, {
    backgroundImage: `url(${CAPTURES}panel-already-applied.png)`,
    backgroundSize: `${400 * s}px ${820 * s}px`,
    backgroundPosition: `${-(wr.x - 6) * s}px ${-(wr.y - 6) * s}px`,
  });

  tl.set(scene, { opacity: 1 }, t0);
  frameIn(b.root, t0 + 0.1);
  reveal([title], t0 + 0.2);
  reveal([body], t0 + 0.8);
  const list = layout.applications.list;
  tl.to(b.cam, { ...cam(b, list.x + list.width / 2, list.y + list.height / 2, 1.55), duration: 1.6, ease: 'power3.inOut' }, t0 + 1.3);
  tl.fromTo(warn, { opacity: 0, y: 50, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: 'expo.out' }, t0 + 3.0);
  hide([title, body], t0 + 5.95);
  frameOut(b.root, t0 + 5.9);
  tl.to(warn, { opacity: 0, y: -20, duration: 0.5, ease: 'power2.in' }, t0 + 5.85);
  tl.set(scene, { opacity: 0 }, t0 + 6.6);
}

// ---------------------------------------------------------------------------
// 7 · Works with Claude and your AI agent
// ---------------------------------------------------------------------------
{
  const t0 = S.agents;
  const scene = el('div', 'scene', stage);
  const agentsTitle = `<span class="dim">${T.agentsDim}</span><br>${T.agents}`;
  const [title, bodyA] = textBlock(scene, { x: M, y: 250, w: 750 }, [
    ['title', agentsTitle],
    ['body', T.agentsA],
  ]);
  bodyA.style.marginTop = '34px';
  const bodyB = textBlock(scene, { x: M, y: 250, w: 750 }, [['title', agentsTitle], ['body', T.agentsB]]);
  bodyB[0].style.visibility = 'hidden';
  bodyB[1].style.marginTop = '34px';
  gsap.set([bodyA, bodyB[1]], { opacity: 0 });
  const agents = place(el('div', 'agents', scene), M, 700);
  const tiles = ['claude', 'codex', 'antigravity', 'opencode', 'cursor'].map((n) => el('div', 'tile', agents, agentSvgs[n]));

  const chat = place(el('div', 'chat', scene), 890, 116, W - M - 890);
  const head = el('div', 'head', chat, `${agentSvgs.claude}<span class="name">Claude</span><span class="conn"><i></i>${T.chatConnected}</span>`);
  head.querySelector('svg').style.cssText = 'width:38px;height:38px';
  const msgs = el('div', 'msgs', chat);
  const user = el('div', 'user', msgs, T.chatUser);
  const tool1 = el('div', 'tool', msgs, `${icon(ICONS.check)}answeronce · import_cv_file`);
  const tool2 = el('div', 'tool', msgs, `${icon(ICONS.check)}answeronce · list_applications`);
  const reply = el('div', 'reply', msgs, `<span class="avatar">${agentSvgs.claude}</span><span>${T.chatReply}</span>`);

  // The proposal waiting in AnswerOnce (cropped from the capture).
  const acc = layout['proposal-review'].accept;
  const crop = { x: 346, y: acc.y - 189, width: 840, height: 241 };
  const s = 1.1;
  const prop = place(el('div', 'crop', scene), W - M - crop.width * s, H - M - crop.height * s, crop.width * s, crop.height * s);
  Object.assign(prop.style, {
    backgroundImage: `url(${CAPTURES}proposal-review.png)`,
    backgroundSize: `${1280 * s}px ${860 * s}px`,
    backgroundPosition: `${-crop.x * s}px ${-crop.y * s}px`,
  });
  const cur = cursor(scene);
  const accP = { x: W - M - crop.width * s + (acc.x - crop.x + acc.width * 0.82) * s, y: H - M - crop.height * s + (acc.y - crop.y + acc.height * 0.62) * s };

  tl.set(scene, { opacity: 1 }, t0);
  reveal([title], t0 + 0.05);
  reveal([bodyA], t0 + 0.75);
  tl.fromTo(tiles, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'back.out(1.6)', stagger: 0.08 }, t0 + 1.0);
  frameIn(chat, t0 + 0.25);
  reveal([user], t0 + 0.9, 0, 20);
  reveal([tool1], t0 + 1.7, 0, 14);
  reveal([tool2], t0 + 2.15, 0, 14);
  reveal([reply], t0 + 2.75, 0, 20);
  hide([bodyA], t0 + 4.05);
  reveal([bodyB[1]], t0 + 4.4);
  tl.fromTo(prop, { opacity: 0, y: 60, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: 'expo.out' }, t0 + 4.3);
  tl.fromTo(cur, { opacity: 0, x: accP.x - 300, y: accP.y + 120 }, { opacity: 1, duration: 0.3, ease: 'none' }, t0 + 5.3);
  tl.to(cur, { x: accP.x, y: accP.y, duration: 0.9, ease: 'power3.inOut' }, t0 + 5.35);
  press(cur, t0 + 6.45);
  click(scene, t0 + 6.4, accP);
  hide([title, bodyB[1]], t0 + 7.45);
  tl.to(tiles, { opacity: 0, y: -16, duration: 0.45, ease: 'power2.in', stagger: 0.03 }, t0 + 7.4);
  frameOut(chat, t0 + 7.4);
  tl.to([prop, cur], { opacity: 0, duration: 0.5, ease: 'power2.in' }, t0 + 7.4);
  tl.set(scene, { opacity: 0 }, t0 + 8.1);
}

// ---------------------------------------------------------------------------
// 8 · Privacy: your profile lives on your disk
// ---------------------------------------------------------------------------
{
  const t0 = S.privacy;
  const scene = el('div', 'scene', stage);
  const [title, body] = textBlock(scene, { x: M, y: 160, w: W - 2 * M, align: 'center' }, [
    ['title', `<span class="dim">${T.privacyDim}</span> ${T.privacy}`],
    ['body', T.privacyA],
  ]);
  body.style.marginTop = '22px';
  const folder = place(el('div', 'folder', scene), 288, 430, 800);
  el('div', 'head', folder, `${icon(ICONS.folder)}answeronce<span class="path">~/Documents</span>`);
  const rows = [
    ['folder', 'documents', 'CV'],
    ['json', 'applications.json', 'JSON'],
    ['json', 'profile.json', 'JSON'],
    ['json', 'settings.json', 'JSON'],
  ].map(([ic, name, kind]) => el('div', 'row', folder, `${icon(ICONS[ic])}<span>${name}</span><span class="kind">${kind}</span>`));
  const pills = [
    ['userX', T.noAccount],
    ['serverOff', T.noServer],
    ['eyeOff', T.noTracking],
  ].map(([ic, text], n) => place(el('div', 'pill', scene, `<span class="ic">${icon(ICONS[ic])}</span>${text}`), 1152, 430 + n * 130, 480));

  tl.set(scene, { opacity: 1 }, t0);
  reveal([title], t0 + 0.05);
  reveal([body], t0 + 0.55);
  frameIn(folder, t0 + 0.7, 50);
  tl.fromTo(rows, { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out', stagger: 0.12 }, t0 + 1.0);
  tl.fromTo(pills, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.9, ease: 'expo.out', stagger: 0.28 }, t0 + 1.5);
  hide([title, body], t0 + 4.45);
  frameOut(folder, t0 + 4.4);
  tl.to(pills, { opacity: 0, y: -20, duration: 0.5, ease: 'power2.in', stagger: 0.05 }, t0 + 4.4);
  tl.set(scene, { opacity: 0 }, t0 + 5.1);
}

// ---------------------------------------------------------------------------
// 9 · End card
// ---------------------------------------------------------------------------
{
  const t0 = S.end;
  const scene = el('div', 'scene', stage);
  const col = el('div', 'abs', scene);
  Object.assign(col.style, { left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' });
  const glow = el('div', 'glow abs', scene);
  place(glow, W / 2 - 300, 70, 600, 600);
  const logo = el('img', 'logo', col);
  logo.src = LOGO;
  Object.assign(logo.style, { width: '150px', height: '150px' });
  const word = el('div', 'wordmark', col, 'AnswerOnce');
  word.style.marginTop = '30px';
  const tag = el('div', 'title center', col, `<span class="dim">${T.tagDim}</span> ${T.tag}`);
  Object.assign(tag.style, { fontSize: '68px', marginTop: '10px' });
  const free = el('div', 'endline', col, T.free);
  free.style.marginTop = '54px';
  const url = el('div', 'endline url', col, `${icon(ICONS.github, 'class="gh"')}github.com/CarlosLeonCode/answeronce`);
  url.style.marginTop = '20px';
  const by = el('div', 'endline', col, `<span class="avatar-cl">CL</span>${T.createdBy} <strong>carlosleoncode</strong>`);
  by.style.marginTop = '22px';

  tl.set(scene, { opacity: 1 }, t0);
  tl.fromTo(glow, { opacity: 0, scale: 0.5 }, { opacity: 0.8, scale: 1, duration: 1.6, ease: 'expo.out' }, t0);
  tl.fromTo(logo, { opacity: 0, scale: 0.7, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 1.2, ease: 'expo.out' }, t0 + 0.05);
  reveal([word, tag], t0 + 0.35, 0.15);
  reveal([free, url, by], t0 + 1.0, 0.18, 22);
}

tl.to({}, { duration: S.total }, 0); // fixes the total length

// ---------------------------------------------------------------------------
// Render hooks
// ---------------------------------------------------------------------------
async function ready() {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  // Background images of crops.
  await Promise.all(
    [...document.querySelectorAll('.crop')].map((node) => {
      const src = node.style.backgroundImage.slice(5, -2);
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => undefined);
    }),
  );
}

window.__duration = tl.duration();
window.__seek = (t) => {
  tl.time(t, false);
};
window.__ready = ready().then(() => true);

if (!RENDER) {
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${s})`;
  };
  fit();
  addEventListener('resize', fit);
  await window.__ready;
  const start = Number(params.get('t') ?? 0);
  tl.time(start, false);
  if (!params.has('still')) tl.play();
}
