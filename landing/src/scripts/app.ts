/**
 * Page entry. Everything here is tiny; GSAP and three.js are loaded lazily after first paint,
 * and only when motion is allowed.
 */
// Reveal blocks as they enter the viewport.
const targets = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((t) => io.observe(t));
} else {
  targets.forEach((t) => t.classList.add('in'));
}

// Copy buttons on code blocks.
if (navigator.clipboard) {
  document.querySelectorAll<HTMLButtonElement>('.copy-btn').forEach((btn) => {
    btn.classList.remove('hidden');
    btn.classList.add('inline-flex');
    const label = btn.querySelector('.copy-label')!;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? '');
        label.textContent = 'Copied';
      } catch {
        label.textContent = 'Press ⌘C';
      }
      setTimeout(() => (label.textContent = 'Copy'), 1600);
    });
  });
}

// Scroll-driven storytelling: after first paint, only when motion is allowed.
const root = document.documentElement;
if (root.classList.contains('motion')) {
  requestAnimationFrame(() =>
    setTimeout(() => {
      import('./motion')
        .then((m) => m.initMotion())
        .catch(() => {
          // GSAP failed to load: fall back to the static layout.
          root.classList.remove('motion', 'webgl');
        });
    }, 0),
  );
}
