import { defineConfig } from '@playwright/test';

// Product captures for the AnswerOnce video and the landing screenshots.
// Loads the built extension (.output/chrome-mv3) through the e2e harness.
// Run from the repo root: pnpm build && pnpm exec playwright test -c video/playwright.config.ts
export default defineConfig({
  testDir: 'capture',
  outputDir: '../test-results/video-capture',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    // Extensions only load in the full Chromium build, not the headless shell.
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 860 },
    actionTimeout: 15_000,
  },
});
