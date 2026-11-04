/**
 * Draws the laptop screen: a job application in a browser window that fills field by field,
 * then AnswerOnce's in-page panel sliding in. Logical size is 2048 × 1280 (16:10); the backing canvas
 * may be smaller and is scaled.
 */
export const SCREEN_W = 2048;
export const SCREEN_H = 1280;

export interface ScreenState {
  /** 0..1 — fields fill one after another. */
  fill: number;
  /** 0..1 — AnswerOnce panel slides in. */
  panel: number;
}

const FONT = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';
const C = {
  chrome: '#f1f1f4',
  chromeLine: '#e4e4e7',
  page: '#ffffff',
  text: '#18181b',
  label: '#27272a',
  muted: '#71717a',
  faint: '#a1a1aa',
  input: '#ffffff',
  inputLine: '#d4d4d8',
  green: '#16a34a',
  indigo: '#4f46e5',
  amber: '#d97706',
};

interface Field {
  label: string;
  value: string;
  x: number;
  y: number;
  w: number;
  kind?: 'file' | 'select';
}

const L = 96;
const COL = 600;
const GAP = 32;
const R = L + COL + GAP;
const FULL = COL * 2 + GAP;

const FIELDS: Field[] = [
  { label: 'First name', value: 'Jordan', x: L, y: 478, w: COL },
  { label: 'Last name', value: 'Rivera', x: R, y: 478, w: COL },
  { label: 'Email', value: 'jordan.rivera@example.com', x: L, y: 616, w: COL },
  { label: 'Phone', value: '+351 912 345 678', x: R, y: 616, w: COL },
  { label: 'LinkedIn profile', value: 'linkedin.com/in/jordan-rivera-dev', x: L, y: 754, w: COL },
  { label: 'Website / portfolio', value: 'jordanrivera.dev', x: R, y: 754, w: COL },
  { label: 'Resume / CV', value: 'jordan-rivera-cv.pdf', x: L, y: 892, w: FULL, kind: 'file' },
  { label: 'Are you legally authorized to work in Portugal?', value: 'Yes', x: L, y: 1030, w: FULL, kind: 'select' },
];

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function check(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string, lw = 4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.45, cy);
  ctx.lineTo(cx - s * 0.1, cy + s * 0.35);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.35);
  ctx.stroke();
}

function drawChrome(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.chrome;
  ctx.fillRect(0, 0, SCREEN_W, 84);
  ctx.fillStyle = C.chromeLine;
  ctx.fillRect(0, 83, SCREEN_W, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(46 + i * 34, 42, 10, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  rr(ctx, 560, 20, 928, 44, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // lock
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 2.5;
  rr(ctx, 790, 38, 16, 13, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(798, 38, 5.5, Math.PI, 0);
  ctx.stroke();
  text(ctx, 'careers.fieldstone.example/jobs/senior-frontend-engineer', 820, 50, font(400, 22), C.muted);
}

function drawPage(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 84, SCREEN_W, SCREEN_H - 84);
  // site header
  const g = ctx.createLinearGradient(96, 112, 140, 156);
  g.addColorStop(0, '#2dd4bf');
  g.addColorStop(1, '#14b8a6');
  rr(ctx, 96, 108, 46, 46, 12);
  ctx.fillStyle = g;
  ctx.fill();
  text(ctx, 'Fieldstone careers', 162, 142, font(600, 30), C.text);
  text(ctx, 'Life at Fieldstone', 1952, 142, font(500, 24), C.muted, 'right');
  text(ctx, 'Open roles', 1720, 142, font(500, 24), C.muted, 'right');
  ctx.fillStyle = C.chromeLine;
  ctx.fillRect(0, 184, SCREEN_W, 1);

  text(ctx, 'Engineering · Remote (EU)', L, 246, font(500, 24), C.muted);
  text(ctx, 'Senior Frontend Engineer', L, 312, font(700, 58), C.text);
  text(ctx, 'Full-time · Lisbon or remote within the EU', L, 360, font(400, 26), C.muted);
  text(ctx, 'Apply for this job', L, 432, font(600, 34), C.text);

  // right column: about card (covered by the panel later)
  const ax = 1400;
  rr(ctx, ax, 230, 552, 420, 22);
  ctx.fillStyle = '#fafafa';
  ctx.fill();
  ctx.strokeStyle = C.chromeLine;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'About the role', ax + 34, 290, font(600, 28), C.text);
  const lines = [470, 430, 486, 390, 452, 300];
  lines.forEach((w, i) => {
    rr(ctx, ax + 34, 326 + i * 44, w, 14, 7);
    ctx.fillStyle = i === 5 ? '#f1f1f4' : '#e9e9ee';
    ctx.fill();
  });
  rr(ctx, ax, 680, 552, 200, 22);
  ctx.fillStyle = '#fafafa';
  ctx.fill();
  ctx.strokeStyle = C.chromeLine;
  ctx.stroke();
  text(ctx, 'Team', ax + 34, 740, font(600, 28), C.text);
  [0, 1, 2, 3].forEach((i) => {
    ctx.beginPath();
    ctx.arc(ax + 62 + i * 70, 812, 26, 0, Math.PI * 2);
    ctx.fillStyle = ['#e4e4e7', '#e0e7ff', '#d1fae5', '#fde2e2'][i];
    ctx.fill();
  });
}

function drawField(ctx: CanvasRenderingContext2D, f: Field, t: number) {
  const required = f.label !== 'Website / portfolio' && f.label !== 'Phone';
  text(ctx, f.label, f.x, f.y, font(600, 25), C.label);
  if (required) {
    ctx.font = font(600, 25);
    const w = ctx.measureText(f.label).width;
    text(ctx, '*', f.x + w + 8, f.y, font(600, 25), '#dc2626');
  }
  const by = f.y + 18;
  const bh = f.kind === 'file' ? 76 : 68;
  const done = t >= 1;
  const active = t > 0 && !done;

  rr(ctx, f.x, by, f.w, bh, 12);
  ctx.fillStyle = f.kind === 'file' ? '#fafafa' : C.input;
  ctx.fill();
  if (done) {
    ctx.save();
    ctx.shadowColor = 'rgba(22,163,74,0.35)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  } else if (active) {
    ctx.strokeStyle = C.indigo;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.strokeStyle = C.inputLine;
    ctx.lineWidth = 2;
    if (f.kind === 'file') ctx.setLineDash([8, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const ty = by + bh / 2 + 9;
  if (f.kind === 'file') {
    rr(ctx, f.x + 14, by + 12, 112, 52, 10);
    ctx.fillStyle = '#f1f1f4';
    ctx.fill();
    text(ctx, 'Attach', f.x + 70, by + 46, font(500, 23), C.label, 'center');
    if (t > 0.35) {
      ctx.globalAlpha = clamp01((t - 0.35) / 0.4);
      // pdf chip
      rr(ctx, f.x + 146, by + 14, 34, 46, 6);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      text(ctx, 'PDF', f.x + 163, by + 44, font(700, 12), '#fff', 'center');
      text(ctx, f.value, f.x + 196, ty, font(500, 25), C.text);
      ctx.font = font(500, 25);
      const w = ctx.measureText(f.value).width;
      text(ctx, '· 182 KB · from your folder', f.x + 206 + w, ty, font(400, 23), C.muted);
      ctx.globalAlpha = 1;
    } else {
      text(ctx, 'No file chosen', f.x + 146, ty, font(400, 24), C.faint);
    }
  } else if (f.kind === 'select') {
    text(ctx, t > 0.4 ? f.value : 'Select…', f.x + 24, ty, font(t > 0.4 ? 500 : 400, 26), t > 0.4 ? C.text : C.faint);
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.x + f.w - 44, by + bh / 2 - 5);
    ctx.lineTo(f.x + f.w - 34, by + bh / 2 + 5);
    ctx.lineTo(f.x + f.w - 24, by + bh / 2 - 5);
    ctx.stroke();
  } else {
    const n = Math.round(clamp01(t / 0.85) * f.value.length);
    const s = f.value.slice(0, n);
    text(ctx, s, f.x + 24, ty, font(500, 26), C.text);
    if (active) {
      ctx.font = font(500, 26);
      const w = ctx.measureText(s).width;
      ctx.fillStyle = C.text;
      ctx.fillRect(f.x + 27 + w, by + 18, 2.5, bh - 36);
    }
  }
  if (done) {
    ctx.beginPath();
    ctx.arc(f.x + f.w - 34, by + bh / 2, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22,163,74,0.12)';
    ctx.fill();
    check(ctx, f.x + f.w - 34, by + bh / 2, 15, C.green, 3.5);
  }
}

function drawConsent(ctx: CanvasRenderingContext2D, tag: number) {
  const y = 1184;
  rr(ctx, L, y - 26, 34, 34, 8);
  ctx.fillStyle = C.input;
  ctx.fill();
  ctx.strokeStyle = tag > 0 ? 'rgba(217,119,6,0.85)' : '#a1a1aa';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const consent = 'I agree to the Privacy Policy and consent to Fieldstone processing my data.';
  text(ctx, consent, L + 52, y, font(400, 25), C.label);
  const cw = ctx.measureText(consent).width;
  text(ctx, '*', L + 58 + cw, y, font(600, 25), '#dc2626');
  if (tag > 0) {
    ctx.globalAlpha = tag;
    const tx = L + 52 + cw + 36;
    rr(ctx, tx, y - 32, 176, 44, 22);
    ctx.fillStyle = 'rgba(245,158,11,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(217,119,6,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx + 26, y - 10, 9, 0, Math.PI * 2);
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = C.amber;
    ctx.fillRect(tx + 25, y - 15, 2.5, 6);
    ctx.fillRect(tx + 25, y - 7, 2.5, 2.5);
    text(ctx, 'Left to you', tx + 44, y - 1, font(600, 22), '#b45309');
    ctx.globalAlpha = 1;
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, p: number) {
  if (p <= 0) return;
  const e = 1 - Math.pow(1 - p, 3);
  const w = 592;
  const x = SCREEN_W + 20 - (SCREEN_W + 20 - 1416) * e;
  const y = 108;
  const h = 984;
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 2.2);
  ctx.shadowColor = 'rgba(24,24,40,0.22)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetX = -10;
  rr(ctx, x, y, w, h, 26);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 2.2);
  rr(ctx, x, y, w, h, 26);
  ctx.strokeStyle = 'rgba(79,70,229,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.clip();

  // drag bar
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(x, y, w, 60);
  text(ctx, 'AnswerOnce · drag to move', x + 26, y + 39, font(500, 22), '#4338ca');
  text(ctx, '–   ×', x + w - 26, y + 39, font(500, 24), '#4338ca', 'right');

  const ix = x + 28;
  const iw = w - 56;
  let cy = y + 96;
  // brand row
  const g = ctx.createLinearGradient(ix, cy, ix + 52, cy + 52);
  g.addColorStop(0, '#818cf8');
  g.addColorStop(1, '#4f46e5');
  rr(ctx, ix, cy, 52, 52, 13);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(ix + 31, cy + 21, 8, 0, Math.PI * 2);
  ctx.moveTo(ix + 25, cy + 27);
  ctx.lineTo(ix + 15, cy + 37);
  ctx.moveTo(ix + 19, cy + 33);
  ctx.lineTo(ix + 23, cy + 37);
  ctx.stroke();
  text(ctx, 'AnswerOnce', ix + 70, cy + 37, font(600, 30), C.text);
  text(ctx, 'Profile', ix + iw, cy + 36, font(500, 23), C.muted, 'right');

  cy += 84;
  rr(ctx, ix, cy, iw, 52, 14);
  ctx.fillStyle = '#eef2ff';
  ctx.fill();
  text(ctx, 'Filling', ix + 22, cy + 34, font(400, 22), C.muted);
  text(ctx, 'careers.fieldstone.example', ix + 102, cy + 34, font(600, 22), C.text);

  cy += 74;
  rr(ctx, ix, cy, iw, 150, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ix + 52, cy + 52, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#e0e7ff';
  ctx.fill();
  text(ctx, 'JR', ix + 52, cy + 60, font(600, 21), '#4338ca', 'center');
  text(ctx, 'Jordan Rivera', ix + 98, cy + 46, font(600, 25), C.text);
  ctx.beginPath();
  ctx.arc(ix + 104, cy + 72, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#16a34a';
  ctx.fill();
  text(ctx, 'Connected · answeronce', ix + 116, cy + 80, font(400, 21), C.muted);
  rr(ctx, ix + 24, cy + 112, iw - 48, 8, 4);
  ctx.fillStyle = '#4f46e5';
  ctx.fill();

  cy += 172;
  rr(ctx, ix, cy, iw, 66, 16);
  ctx.fillStyle = '#4f46e5';
  ctx.fill();
  text(ctx, 'Fill this page', ix + iw / 2, cy + 42, font(600, 26), '#fff', 'center');

  cy += 104;
  text(ctx, 'Results', ix, cy, font(600, 26), C.text);
  rr(ctx, ix + iw - 166, cy - 30, 166, 40, 20);
  ctx.strokeStyle = 'rgba(79,70,229,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'Generic form', ix + iw - 83, cy - 3, font(500, 20), '#4338ca', 'center');

  cy += 26;
  const stats: [string, string, string][] = [
    ['8', 'Filled', '#16a34a'],
    ['1', 'Need input', C.amber],
    ['0', 'Kept', C.muted],
  ];
  const sw = (iw - 24) / 3;
  stats.forEach(([n, l, c], i) => {
    const sx = ix + i * (sw + 12);
    rr(ctx, sx, cy, sw, 104, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e4e4e7';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx + 30, cy + 36, 10, 0, Math.PI * 2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    text(ctx, n, sx + 50, cy + 46, font(700, 30), C.text);
    text(ctx, l, sx + 20, cy + 84, font(400, 20), C.muted);
  });

  cy += 148;
  const group = (title: string, item: string, color: string, sub: string) => {
    ctx.letterSpacing = '2px';
    text(ctx, title, ix, cy, font(600, 18), C.muted);
    ctx.letterSpacing = '0px';
    cy += 18;
    rr(ctx, ix, cy, iw, 86, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e4e4e7';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ix + 32, cy + 43, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    text(ctx, item, ix + 56, cy + 38, font(500, 22), C.text);
    text(ctx, sub, ix + 56, cy + 66, font(400, 19), C.muted);
    cy += 120;
  };
  group('NEEDS YOUR INPUT', 'Why do you want to work at Fieldstone?', C.amber, 'long text · type it or draft with AI');
  group('LEFT TO YOU', 'I agree to the Privacy Policy…', C.muted, 'Consent field, left to you');
  ctx.restore();
}

/** Paint one frame of the screen. `ctx` is expected to be scaled to SCREEN_W × SCREEN_H. */
export function drawScreen(ctx: CanvasRenderingContext2D, s: ScreenState) {
  ctx.letterSpacing = '0px';
  ctx.textBaseline = 'alphabetic';
  drawChrome(ctx);
  drawPage(ctx);
  const n = FIELDS.length;
  FIELDS.forEach((f, i) => drawField(ctx, f, clamp01(s.fill * n * 1.08 - i)));
  drawConsent(ctx, clamp01((s.fill - 0.93) / 0.07));
  drawPanel(ctx, s.panel);
}
