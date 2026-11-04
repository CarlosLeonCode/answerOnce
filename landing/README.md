# AnswerOnce landing page

Static marketing page for the AnswerOnce extension, built with Astro and Tailwind CSS v4. It is a
standalone project: it has its own `package.json` and lockfile and does not touch the extension
source in `../src`.

## Run

Requirements: Node 24+, pnpm 10.

```sh
cd landing
pnpm install
pnpm dev        # http://localhost:4321 with hot reload
pnpm build      # static output in dist/
pnpm preview    # serve dist/ locally
```

The install page (`/install/`) links to `public/downloads/answeronce-chrome.zip` and `answeronce.mcpb`. They are
build artifacts (gitignored): from the repository root, `pnpm landing:build` builds them, copies them in and
then builds this site. A plain `pnpm build` here still works, but without the files the download links 404.

Set `SITE_URL` when building for production so the canonical URL and Open Graph image use
absolute URLs:

```sh
SITE_URL=https://answeronce.example.com pnpm build
```

The "Source" links in the nav, install section and footer come from `repoUrl` in `src/site.ts` (empty hides them).

## Structure

```
src/
  pages/                Thin routes: index.astro and install.astro (English), es/ (Spanish)
  components/pages/     HomePage.astro (page composition), InstallPage.astro (step-by-step install
                        guide, auto-downloads with ?download=1); both read the locale from the URL
  i18n/                 en.ts (source of the `Strings` shape), es.ts, helpers (useStrings, localize)
  layouts/Base.astro    <head>, SEO/OG/hreflang tags, motion-mode flags (set before first paint)
  components/           One component per section, plus Nav (menu panel, language switch), Icon, Shot,
                        CodeBlock, Brand, FormSkeleton, Rich (formats **bold**/`code` in strings)
  scripts/nav.ts        Menu panel, Tools dropdown, language links
  scripts/app.ts        Entry: reveal-on-scroll, copy buttons; lazy-loads motion.ts
  scripts/motion.ts     GSAP ScrollTrigger timelines (hero, vault); lazy-loads hero3d.ts
  scripts/hero3d.ts     Procedural three.js laptop (no external models)
  scripts/screen.ts     2D canvas drawing of the form and in-page panel shown on the laptop screen
  assets/shots/         Product screenshots, optimized to WebP at build time
  styles/global.css     Tailwind import, light theme tokens, stage/sticky layout rules
public/                 favicon.svg, favicon-32.png, apple-touch-icon.png, og.png
```

## Motion and fallbacks

The page is light only (`color-scheme: light`). Scroll stages use CSS `position: sticky` with GSAP
ScrollTrigger scrubbing the timelines, so there are no pin spacers and no layout shift.

- `prefers-reduced-motion: reduce`: no GSAP, no three.js. Stages collapse to a static layout and the
  hero shows the real screenshot in a CSS device frame.
- No WebGL 2: the hero falls back to the same static frame; three.js is never downloaded.
- three.js loads in an idle task after first paint, renders only while the hero is on screen and the
  tab is visible, and caps the pixel ratio (1.75 desktop, 1.25 mobile).

## Screenshots

`src/assets/shots` holds real screenshots of the extension, captured with fictional data. The page
uses the `-light` variants; replace a file with the same name to update a screenshot.
