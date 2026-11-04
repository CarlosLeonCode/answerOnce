/**
 * Header: the menu panel below xl, the Tools dropdown (click/tap and keyboard; mouse hover is CSS),
 * and the language links (they keep the current #section).
 */
const header = document.querySelector<HTMLElement>('[data-site-header]');

// ---------- Menu panel (below xl) ----------
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const menu = document.querySelector<HTMLElement>('[data-menu]');

if (header && toggle && menu) {
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  const setOpen = (open: boolean, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', (open ? toggle.dataset.labelClose : toggle.dataset.labelOpen) ?? '');
    menu.hidden = !open;
    if (!open && restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  // Following a link closes the panel (also for same-page #section links).
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !header.contains(e.target as Node)) setOpen(false);
  });
  matchMedia('(min-width: 1280px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

// ---------- Dropdowns (Tools) ----------
for (const dd of document.querySelectorAll<HTMLElement>('[data-dropdown]')) {
  const button = dd.querySelector<HTMLButtonElement>('button[aria-expanded]');
  if (!button) continue;
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  const setOpen = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    dd.toggleAttribute('data-open', open);
  };
  button.addEventListener('click', () => setOpen(!isOpen()));
  dd.addEventListener('focusout', (e) => {
    if (!dd.contains(e.relatedTarget as Node | null)) setOpen(false);
  });
  dd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !dd.contains(e.target as Node)) setOpen(false);
  });
}

// ---------- Language links keep the section you are reading ----------
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]')) {
  link.addEventListener('click', () => {
    if (location.hash && !link.hash) link.hash = location.hash;
  });
}
