# Contributing to AnswerOnce

Thanks for helping. Bug reports, new ATS support and small focused pull requests are all welcome.
For anything larger than a fix, open an issue first so we can agree on the approach.

## Setup

Requirements: Node 24 (see [`.nvmrc`](.nvmrc)), pnpm 10 (the exact version is in `packageManager`
in [`package.json`](package.json); `corepack enable` picks it up), Chrome 116+.

```sh
pnpm install
pnpm build                          # outputs .output/chrome-mv3
pnpm exec playwright install chromium   # once, for the e2e tests
```

Load `.output/chrome-mv3` in `chrome://extensions` (Developer mode → **Load unpacked**).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds `answeronce-mcp`, then WXT with hot reload in a fresh Chrome instance |
| `pnpm build` | `pnpm build:mcp`, then `wxt build` → `.output/chrome-mv3` |
| `pnpm build:mcp` | Bundles `answeronce-mcp` → `mcp/dist/answeronce-mcp.js` and `mcp/dist/answeronce.mcpb` |
| `pnpm validate:mcpb` | Validates the generated MCP Bundle manifest |
| `pnpm zip` | Builds a zip of the extension for a release |
| `pnpm test` | Vitest: unit tests plus an integration test that spawns the bundled MCP server over stdio |
| `pnpm test:e2e` | `pnpm build`, then Playwright against the built extension (`pnpm test:e2e:only` reuses the build) |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm icons` | Rasterizes `brand/answeronce-icon.svg` into `public/icon/` and the landing favicons (uses Playwright Chromium) |

The landing site in `landing/` is a separate project with its own lockfile:

```sh
pnpm --dir landing install
pnpm --dir landing dev       # http://localhost:4321
pnpm --dir landing build     # static output in landing/dist
```

## Architecture

Hexagonal (ports and adapters): `src/domain` (pure rules), `src/application` (use cases),
`src/ports` (interfaces), `src/infrastructure` (folder storage, LLM providers, ATS adapters, text
extraction), `src/page-agent` (code injected into the job page), `src/ui` (React) and thin WXT
`src/entrypoints`. `mcp/src` is the `answeronce-mcp` server and imports `src/` directly, so logic is
never copied. See [Architecture in the README](README.md#architecture) for the full map.

Keep dependencies pointing inward: `domain` imports nothing from the other layers, `application`
talks to the outside only through `ports`.

## Conventions

- **English** for code, comments, UI copy, docs and commit messages.
- **Conventional commits**: `feat: …`, `fix: …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`.
- **Tests with every change.** Unit tests live in `tests/unit`, e2e specs in `e2e/`. Run
  `pnpm typecheck` and `pnpm test` before opening a PR, and `pnpm test:e2e` when you touch the UI
  or code that runs in the page.
- Keep PRs small and focused; describe the behavior change, not just the diff.

## License and CLA

AnswerOnce is licensed under the [AGPL-3.0](LICENSE). On your first pull request, a bot asks you to
sign the [Contributor License Agreement](CLA.md) by posting a comment; you only do it once. You keep
the copyright in your work; the CLA lets the maintainer also offer AnswerOnce under other terms.

Forks are welcome, but the name and logo are not part of the code license: see
[TRADEMARKS.md](TRADEMARKS.md).

## Privacy rules (non-negotiable)

These are the product. A PR that breaks one of them will not be merged.

- **No backend.** AnswerOnce never talks to a server of its own. The only network calls go to the LLM
  provider the user configured, after they click an AI action (with an explicit confirmation for
  cloud providers when the full CV is sent).
- **No analytics, telemetry or crash reporting**, and no remote code or remote scripts.
- **No personal data in browser storage.** The profile lives in the user's folder.
  `chrome.storage.local` and IndexedDB hold no personal data (IndexedDB keeps only the folder
  handle); the loaded profile is cached only in `chrome.storage.session` (`TRUSTED_CONTEXTS`).
- **Consent fields are never filled.** Consent, terms, privacy, attestation, marketing opt-in and
  e-signature fields stay for the user, in every language AnswerOnce supports, and are never stored in
  application records.
- **Never submit a form.** The user always reviews and clicks Submit.
- **Agents never read `settings.json`.** `answeronce-mcp` reads only `profile.json`,
  `applications.json` and document metadata, and returns only the sections asked for.
- **Minimal permissions.** No `<all_urls>` host permission and no always-on content scripts; new
  hosts are optional permissions requested at runtime.
- Test data must be fictional (see `tests/fixtures`). Never commit a real CV, profile or API key.

## Adding support for an ATS

1. **Fixture.** Save a trimmed copy of a public application form as `tests/fixtures/<ats>.html`
   with fictional content and no tracking scripts.
2. **Adapter.** Add `src/infrastructure/ats/<ats>.ts` implementing `AtsAdapter`
   (`src/ports/ats-adapter.ts`). Most ATSs fit `tableAdapter` from `base.ts`: host patterns, a DOM
   hint, a `name`/`id` → canonical key table (`src/domain/canonical-keys.ts`) and a `jobMeta`
   function for company and role (see `lever.ts`).
3. **Detection hint.** Add a selector for its markup to `detectHints` in
   `src/page-agent/detector.ts`, and any header selector `jobMeta` reads to the list in
   `src/domain/job-meta.ts`.
4. **Register it** in `ATS_ADAPTERS` in `src/infrastructure/ats/index.ts`, before
   `genericAdapter`. If its forms are commonly embedded as cross-origin iframes, add the host to
   `ATS_EMBED_ORIGINS` (it becomes an optional host permission).
5. **Tests.** Detection and field mapping in `tests/unit/detector.test.ts`, company/role in
   `tests/unit/applications-storage.test.ts`, and a fill case in `e2e/fill.spec.ts`. Check that
   consent fields on the form are left alone.

Multi-step wizards (Workday and similar) need more than an adapter; open an issue first.
