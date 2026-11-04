/**
 * Scroll-driven storytelling with GSAP ScrollTrigger. Stages use CSS position: sticky for the
 * "pinned" viewport (no pin-spacers, no layout shift); ScrollTrigger scrubs timelines over them.
 * Only loaded when prefers-reduced-motion is not set.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { HeroScene, HeroState } from './hero3d';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

function hero() {
  const root = document.documentElement;
  const stage = $('[data-hero-stage]');
  const canvas = $<HTMLCanvasElement>('[data-hero-canvas]');
  const copy = $('[data-hero-copy]');
  if (!root.classList.contains('webgl') || !stage || !canvas || !copy) return;

  const caps = $$('[data-hero-caption]', stage);
  const hint = $('[data-scroll-hint]', stage);
  const sticky = $('.hero-sticky', stage);
  const agents = $$('[data-agent]', stage);
  const agentsLabel = $('[data-hero-agents-label]', stage);
  const state: HeroState = { cam: 0, back: 0, fill: 0, panel: 0 };
  let scene: HeroScene | null = null;
  let visibility: ScrollTrigger | null = null;

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: () => scene?.setState(state),
    scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true },
  });
  if (hint) tl.to(hint, { autoAlpha: 0, duration: 0.04 }, 0);
  tl.to(copy, { autoAlpha: 0, y: -90, duration: 0.2, ease: 'power1.in' }, 0.01)
    .to(state, { cam: 1, duration: 0.32, ease: 'power2.inOut' }, 0.02)
    .to(state, { fill: 1, duration: 0.26 }, 0.36)
    // End with the camera pulled back so the whole laptop sits inside the frame.
    .to(state, { back: 1, duration: 0.2, ease: 'power2.inOut' }, 0.64);

  // Agent logos: the row fades out with the copy, then each logo rises from behind the laptop
  // (the canvas sits above them), settles around it and drifts outward as the device comes closer.
  // Narrow screens have no room beside the device, so the logos only fade out.
  const narrow = () => window.innerWidth < 768;
  const offsetIn = (el: HTMLElement) => {
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    for (let n: HTMLElement | null = el; n && n !== sticky; n = n.offsetParent as HTMLElement | null) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x, y };
  };
  // Translation that puts the logo of `el` at (fx, fy) half-viewports from the stage center.
  const to = (el: HTMLElement, fx: number, fy: number) => {
    if (!sticky) return { x: 0, y: 0 };
    const logo = $('[data-agent-logo]', el) ?? el;
    const at = offsetIn(logo);
    const hw = Math.min(sticky.clientWidth / 2, 760);
    return { x: sticky.clientWidth / 2 + fx * hw - at.x, y: sticky.clientHeight / 2 + fy * (sticky.clientHeight / 2) - at.y };
  };
  if (agentsLabel) tl.to(agentsLabel, { autoAlpha: 0, y: -60, duration: 0.16, ease: 'power1.in' }, 0.01);
  agents.forEach((el, i) => {
    const fx = Number(el.dataset.x);
    const fy = Number(el.dataset.y);
    const r = Number(el.dataset.r) || 0;
    const name = $('[data-agent-name]', el);
    const logo = $('[data-agent-logo]', el);
    tl.to(el, { autoAlpha: 0, y: -60, duration: 0.16, ease: 'power1.in' }, 0.01 + i * 0.008);
    if (narrow()) return;
    if (name) tl.set(name, { autoAlpha: 0 }, 0.2);
    if (logo) tl.set(logo, { scale: 2.4, transformOrigin: '50% 50%' }, 0.2);
    tl.fromTo(
      el,
      { x: () => to(el, fx * 0.25, 0.12).x, y: () => to(el, fx * 0.25, 0.12).y, rotation: 0, autoAlpha: 0 },
      {
        x: () => to(el, fx * 0.85, fy * 0.9).x,
        y: () => to(el, fx * 0.85, fy * 0.9).y,
        rotation: r,
        autoAlpha: 1,
        duration: 0.3,
        ease: 'power2.out',
        immediateRender: false,
      },
      0.28 + i * 0.03,
    ).to(
      el,
      { x: () => to(el, fx, fy).x, y: () => to(el, fx, fy).y, rotation: r * 0.5, duration: 0.3, ease: 'sine.inOut' },
      0.62,
    );
    if (logo) gsap.to(logo, { yPercent: -12, duration: 2.4 + i * 0.3, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: i * 0.4 });
  });
  // Captions use opacity only (not visibility) so screen readers can always reach the text.
  const capIn = { opacity: 1, y: 0, duration: 0.05, ease: 'power1.out' };
  const capOut = { opacity: 0, y: -14, duration: 0.05, ease: 'power1.in' };
  if (caps[0]) tl.fromTo(caps[0], { opacity: 0, y: 16 }, capIn, 0.36).to(caps[0], capOut, 0.64);
  tl.to(state, { panel: 1, duration: 0.14, ease: 'power2.out' }, 0.66);
  if (caps[1]) tl.fromTo(caps[1], { opacity: 0, y: 16 }, capIn, 0.78);
  tl.to({}, { duration: 0.001 }, 0.999);

  const fallback = () => {
    visibility?.kill();
    tl.scrollTrigger?.kill();
    tl.revert();
    scene?.dispose();
    scene = null;
    root.classList.remove('webgl');
    ScrollTrigger.refresh();
  };

  const load = async (context: WebGL2RenderingContext) => {
    try {
      const { createHeroScene } = await import('./hero3d');
      scene = await createHeroScene(canvas, context, {
        mobile: matchMedia('(max-width: 767px)').matches,
        onFirstFrame: () => canvas.classList.add('ready'),
      });
    } catch {
      fallback();
      return;
    }
    scene.setState(state);
    canvas.addEventListener('webglcontextlost', fallback, { once: true });
    visibility = ScrollTrigger.create({
      trigger: stage,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => (self.isActive ? scene?.start() : scene?.stop()),
    });
    if (visibility.isActive) scene.start();
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) scene?.dispose();
    });
  };

  // Start WebGL in its own idle task, separate from the scroll setup above.
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 600 }) : setTimeout(cb, 120);
  idle(() => {
    // Create the WebGL 2 context first: if it is unavailable, fall back without downloading three.js.
    const context = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (context) load(context);
    else fallback();
  });
}

function vault() {
  const stage = $('[data-vault-stage]');
  const sticky = $('[data-vault-sticky]');
  if (!stage || !sticky) return;
  const frags = $$('[data-frag]', stage);
  const heading = $('[data-vault-heading]', stage);
  const profile = $('[data-vault-profile]', stage);
  const link = $('[data-vault-link]', stage);
  const line = $('[data-vault-line]', stage);
  const file = $('[data-vault-file]', stage);
  const outro = $('[data-vault-outro]', stage);

  const narrow = () => window.innerWidth < 768;
  const sx = () => Math.min(window.innerWidth * 0.42, 620);
  const sy = () => window.innerHeight * 0.34;

  // Scattered positions. Narrow screens: two loose piles, above and below the heading.
  const PILE = [
    [-0.16, -0.275],
    [0.14, -0.25],
    [-0.15, 0.28],
    [0.15, 0.33],
  ];
  const pos = (el: HTMLElement, i: number, spread = 1) => {
    if (!narrow()) return { x: Number(el.dataset.x) * sx() * spread, y: Number(el.dataset.y) * sy() * spread };
    const [px, py] = PILE[i % PILE.length];
    return { x: px * window.innerWidth * spread, y: py * window.innerHeight * spread };
  };
  // Where the profile card sits, relative to the sticky viewport center (fragments are centered there).
  const target = () => {
    if (!profile) return { x: 0, y: 0 };
    const p = profile.getBoundingClientRect();
    const s = sticky.getBoundingClientRect();
    return { x: p.left + p.width / 2 - (s.left + s.width / 2), y: p.top + p.height / 2 - (s.top + s.height / 2) };
  };

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    // Starts while the section scrolls in, so fragments arrive before the sticky part begins.
    scrollTrigger: { trigger: stage, start: 'top 55%', end: 'bottom bottom', scrub: 0.7, invalidateOnRefresh: true },
  });
  frags.forEach((el, i) => {
    const r = Number(el.dataset.r) || 0;
    tl.fromTo(
      el,
      { x: () => pos(el, i, 1.18).x, y: () => pos(el, i, 1.18).y, xPercent: -50, yPercent: -50, rotation: r * 2.2, opacity: 0 },
      { x: () => pos(el, i).x, y: () => pos(el, i).y, rotation: r, opacity: 1, duration: 0.16, ease: 'power2.out' },
      i * 0.025,
    )
      .to(el, { x: () => target().x, y: () => target().y, rotation: 0, scale: 0.9, duration: 0.18, ease: 'power2.inOut' }, 0.5 + i * 0.02)
      .to(el, { opacity: 0, duration: 0.06 }, 0.62 + i * 0.02);
  });
  if (heading) tl.to(heading, { opacity: 0, y: -24, duration: 0.1 }, 0.46);
  if (profile) tl.fromTo(profile, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.1 }, 0.64);
  if (link) tl.fromTo(link, { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0.74);
  if (line) tl.fromTo(line, { scaleX: () => (narrow() ? 1 : 0), scaleY: () => (narrow() ? 0 : 1) }, { scaleX: 1, scaleY: 1, duration: 0.08 }, 0.74);
  if (file) tl.fromTo(file, { opacity: 0, x: () => (narrow() ? 0 : -16), y: () => (narrow() ? -12 : 0) }, { opacity: 1, x: 0, y: 0, duration: 0.08 }, 0.8);
  if (outro) tl.fromTo(outro, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.12 }, 0.86);
  tl.to({}, { duration: 0.001 }, 0.999);
}

export function initMotion() {
  hero();
  vault();
  // Fonts and images can change section heights; re-measure once everything has settled.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}
