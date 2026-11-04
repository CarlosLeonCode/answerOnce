import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (.output/chrome-mv3) into Chromium.
// `pnpm test:e2e` builds first; `pnpm test:e2e:only` reuses the current build.
// Every test launches its own persistent context (extensions need one), so the
// suite runs serially in a single worker.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    // Extensions only load in the full Chromium build, not the headless shell.
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 860 },
    actionTimeout: 15_000,
    // trace/screenshot options only apply to Playwright's built-in context.
    // The extension fixture launches its own context and attaches screenshots
    // of every open page when a test fails.
  },
});
