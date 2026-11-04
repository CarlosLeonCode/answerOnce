import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Frame, type Locator, type Page } from '@playwright/test';
import { focusPage, SimulatedAgent } from '../../e2e/support/agent';
import { FIXTURES_DIR, prepareExtensionCopy, ROOT } from '../../e2e/support/extension';
import { expect, test as base } from '../../e2e/support/fixtures';
import { CV_MODEL_JSON } from '../../e2e/support/profile';

// Captures the current product UI with the fictional Jordan Rivera profile:
// - video stills (light) in video/assets/captures/
// - landing screenshots (light and dark) in landing/src/assets/shots/
// The job page is a fictional "Fieldstone careers" posting, served on its own
// host name through request interception (nothing leaves the machine).

const JOB_ORIGIN = 'http://careers.fieldstone.example';
const JOB_URL = `${JOB_ORIGIN}/jobs/senior-frontend-engineer`;
const JOB_HTML = fs.readFileSync(path.join(import.meta.dirname, 'fieldstone.html'), 'utf8');
const CAPTURES = path.join(ROOT, 'video/assets/captures');
const SHOTS = path.join(ROOT, 'landing/src/assets/shots');

const DRAFT =
  "Fieldstone's focus on tools for field teams matches the work I enjoy most: making complex workflows feel simple. " +
  "I've spent the last three years leading a React design system used by six teams at Lumen Analytics, and I'd love to bring that care for accessibility and performance to your planning app.";

const day = (d: string) => `2026-${d}T09:30:00.000Z`;
const record = (id: string, company: string, role: string, ats: string, created: string, history: string[][]) => ({
  id,
  url: `https://jobs.example.com/${company.toLowerCase().replace(/\W+/g, '-')}/${id}`,
  normalizedUrl: `https://jobs.example.com/${company.toLowerCase().replace(/\W+/g, '-')}/${id}`,
  company,
  role,
  ats,
  createdAt: day(created),
  status: history.at(-1)![0],
  statusHistory: history.map(([status, at]) => ({ status, at: day(at!) })),
  notes: '',
  answers: [],
});

/** Fictional applications shown on the Applications page. */
const APPLICATIONS = [
  record('a1', 'Brightline', 'Frontend Engineer', 'greenhouse', '10-14', [['filled', '10-14'], ['applied', '10-14'], ['interview', '10-22']]),
  record('a2', 'Harbor & Co', 'Senior UI Engineer', 'lever', '10-19', [['filled', '10-19'], ['applied', '10-19']]),
  record('a3', 'Mosaic Maps', 'Product Engineer', 'ashby', '10-23', [['filled', '10-23'], ['applied', '10-23'], ['offer', '10-31']]),
  record('a4', 'Quayside', 'Staff Frontend Engineer', 'generic', '10-08', [['filled', '10-08'], ['applied', '10-08'], ['rejected', '10-20']]),
];

const test = base.extend({
  // The harness copy, plus host access to the fictional job site.
  extensionDir: [
    async ({}, use, workerInfo) => {
      const dir = prepareExtensionCopy(`capture-${workerInfo.workerIndex}`);
      const manifestPath = path.join(dir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { host_permissions: string[] };
      manifest.host_permissions.push(`${JOB_ORIGIN}/*`);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      await use(dir);
    },
    { scope: 'worker' },
  ],

  // Like the e2e context, at deviceScaleFactor 2 and with the job site routed.
  context: async ({ extensionDir, headless, channel, viewport, colorScheme }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel,
      headless,
      viewport,
      colorScheme,
      deviceScaleFactor: 2,
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    await context.addInitScript(() => {
      if (location.protocol !== 'chrome-extension:') return;
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce', { create: true });
    });
    await context.route(`${JOB_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: JOB_HTML }));
    await use(context);
    await context.close();
  },
});

/** Lets fonts, transitions and toasts settle before a screenshot. */
async function settle(page: Page, ms = 600): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Dismisses the toasts (they would cover the UI in a screenshot). */
async function dismissToasts(target: Page | Frame): Promise<void> {
  const toasts = target.locator('.toast');
  for (const button of await target.getByRole('button', { name: 'Dismiss notification' }).all()) await button.click().catch(() => undefined);
  await expect(toasts).toHaveCount(0, { timeout: 15_000 });
}

async function shoot(target: Page | Locator, file: string, options: Parameters<Page['screenshot']>[0] = {}): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await target.screenshot({ ...options, path: file, animations: 'disabled', caret: 'hide' });
}

/** Screenshot of a region of `page`, in CSS pixels. */
async function clip(page: Page, file: string, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  await shoot(page, file, { clip: box });
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Element has no bounding box');
  return b;
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(theme, () => {
    test.use({ colorScheme: theme });

    test(`captures (${theme})`, async ({ answeronce, startOllama }) => {
      const video = theme === 'light';
      const still = (name: string) => path.join(CAPTURES, `${name}.png`);
      const landing = (name: string) => path.join(SHOTS, `${name}-${theme}.png`);
      // Element boxes (CSS px) in the video stills, for camera moves in the composition.
      const layout: Record<string, Record<string, { x: number; y: number; width: number; height: number }>> = {};
      const mark = async (shot: string, marks: Record<string, Locator>) => {
        if (!video) return;
        layout[shot] ??= {};
        for (const [name, locator] of Object.entries(marks)) {
          const b = await box(locator);
          layout[shot]![name] = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
        }
      };
      const ollama = await startOllama((request) => (request.format === 'json' ? JSON.stringify(CV_MODEL_JSON) : DRAFT));

      // --- CV import --------------------------------------------------------
      const options = await answeronce.setUpFolder();
      await options.getByRole('button', { name: 'Import your CV' }).click();
      await options.getByLabel('Choose CV file').setInputFiles(path.join(FIXTURES_DIR, 'sample-cv.pdf'));
      await expect(options.getByText('Text extracted')).toBeVisible({ timeout: 30_000 });
      await options.getByRole('radio', { name: /Structure with AI/ }).check();
      await options.getByRole('radio', { name: /Ollama/ }).check();
      await options.getByLabel('Ollama URL').fill(ollama.baseUrl);
      await options.getByLabel('Model', { exact: true }).fill('llama3.2');
      await settle(options);
      const method = options.getByRole('heading', { name: 'How should AnswerOnce structure it?' });
      await method.scrollIntoViewIfNeeded();
      {
        const h = await box(method);
        await clip(options, landing('import-upload-crop'), { x: h.x - 21, y: h.y - 21, width: 835, height: 545 });
      }

      await options.getByRole('button', { name: 'Extract with Ollama' }).click();
      const save = options.getByRole('button', { name: /^Save \d+ changes? to profile$/ });
      await expect(save).toBeVisible({ timeout: 30_000 });
      await options.getByRole('button', { name: 'Accept all' }).click();
      await options.evaluate(() => window.scrollTo(0, 0));
      await settle(options);
      if (video) await shoot(options, still('import-review'));
      await mark('import-review', { table: options.getByRole('region', { name: 'Personal' }).first(), save, banner: options.getByText('Structured by Ollama', { exact: false }) });
      {
        // The save bar sticks to the bottom of the window: size the window so
        // the bar ends the 885×805 crop, like the original landing shot.
        const viewport = options.viewportSize()!;
        const h = await box(options.getByRole('heading', { name: 'Import from CV' }));
        const barBottom = await save.evaluate((el) => {
          let n: HTMLElement | null = el;
          while (n && !['sticky', 'fixed'].includes(getComputedStyle(n).position)) n = n.parentElement;
          return (n ?? el).getBoundingClientRect().bottom;
        });
        const top = h.y - 26;
        await options.setViewportSize({ width: viewport.width, height: Math.round(top + 805 - 14 + (viewport.height - barBottom)) });
        await settle(options);
        await clip(options, landing('import-review-crop'), { x: h.x - 21, y: top, width: 885, height: 805 });
        await options.setViewportSize(viewport);
      }

      await save.click();
      await expect(options.getByText('Profile updated from your CV')).toBeVisible({ timeout: 30_000 });
      await dismissToasts(options);
      await answeronce.writeFolderFile('applications.json', JSON.stringify({ rev: 1, schemaVersion: 1, applications: APPLICATIONS }, null, 2));

      // --- Fill through the in-page panel (the Arc / fallback overlay) --------
      const job = await answeronce.context.newPage();
      await job.goto(JOB_URL);
      await settle(job);
      if (video) await shoot(job, still('job-empty'));
      await mark('job', { form: job.locator('#application .grid'), first: job.locator('#first_name'), resume: job.locator('#resume'), workAuth: job.locator('#work_auth') });

      await answeronce.clickToolbar(job);
      const overlay: Frame = await answeronce.panelFrame(job);
      await expect(overlay.getByRole('button', { name: 'Fill this page' })).toBeVisible({ timeout: 30_000 });
      await settle(job, 900);
      if (video) await shoot(job, still('overlay-before'));
      await mark('overlay-before', { overlay: job.locator('#answeronce-overlay-host'), fill: overlay.getByRole('button', { name: 'Fill this page' }) });

      await overlay.getByRole('button', { name: 'Fill this page' }).click();
      await expect(overlay.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
      await expect(overlay.getByRole('button', { name: 'Fill this page' })).toBeEnabled({ timeout: 30_000 });
      await dismissToasts(overlay);
      await settle(job, 900);
      await shoot(job, landing('overlay-demo'));
      if (video) await shoot(job, still('overlay-after'));
      await mark('overlay-after', { results: overlay.getByRole('heading', { name: 'Results' }), application: overlay.getByRole('region', { name: 'This application' }) });

      // AI draft for the open question, inserted into the page.
      await overlay.getByRole('heading', { name: 'Results' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await settle(job, 600);
      if (video) await shoot(job, still('overlay-question'));
      await mark('overlay-question', { answer: overlay.getByRole('textbox', { name: /^Answer for/ }), generate: overlay.getByRole('button', { name: 'Generate with AI' }) });
      await overlay.getByRole('button', { name: 'Generate with AI' }).click();
      await expect(overlay.getByText('Draft ready. Review and edit it before inserting.')).toBeVisible({ timeout: 30_000 });
      await overlay.getByRole('heading', { name: 'Results' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await settle(job, 600);
      if (video) await shoot(job, still('overlay-draft'));
      await mark('overlay-draft', { answer: overlay.getByRole('textbox', { name: /^Answer for/ }), generate: overlay.getByRole('button', { name: 'Generate with AI' }), insert: overlay.getByRole('button', { name: 'Insert into page' }) });
      await overlay.getByRole('button', { name: 'Insert into page' }).click();
      await expect(overlay.getByText('Inserted into the page.')).toBeVisible({ timeout: 30_000 });
      await dismissToasts(overlay);
      if (video) {
        await job.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await settle(job, 600);
        await shoot(job, still('overlay-inserted'));
        await mark('overlay-inserted', { why: job.locator('#why'), consent: job.locator('label.consent'), submit: job.locator('button.submit') });
      }
      await answeronce.clickToolbar(job); // closes the overlay

      // --- The panel on its own (side panel width), for the landing ----------
      await job.reload();
      const panel = await answeronce.openPanelFor(job);
      await panel.setViewportSize({ width: 400, height: 820 });
      await panel.getByRole('button', { name: 'Fill this page' }).click();
      await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('button', { name: 'Fill this page' })).toBeEnabled({ timeout: 30_000 });
      await dismissToasts(panel);
      await settle(panel, 900);
      await shoot(panel, landing('panel-after-fill'));
      if (video) await shoot(panel, still('panel-after-fill'), { fullPage: true });

      await panel.getByRole('button', { name: 'Generate with AI' }).click();
      await expect(panel.getByText('Draft ready. Review and edit it before inserting.')).toBeVisible({ timeout: 30_000 });
      await dismissToasts(panel);
      if (video) await shoot(panel, still('panel-draft'), { fullPage: true });
      await settle(panel);
      {
        const results = panel.getByRole('heading', { name: 'Results' });
        await results.scrollIntoViewIfNeeded();
        await panel.evaluate(() => window.scrollBy(0, -1000));
        const r = await box(results);
        await panel.evaluate((y) => window.scrollTo(0, y), r.y - 14);
        await settle(panel, 300);
        const r2 = await box(results);
        await clip(panel, landing('panel-ai-draft-crop'), { x: 0, y: r2.y - 14, width: 400, height: 420 });
      }

      // Mark as applied: the record moves to Applied, and the panel warns next time.
      const card = panel.getByRole('region', { name: 'This application' });
      await card.getByRole('button', { name: 'Mark as applied' }).click();
      await expect(panel.getByText('Marked as applied')).toBeVisible({ timeout: 30_000 });
      await dismissToasts(panel);
      await panel.evaluate(() => window.scrollTo(0, 0));
      await settle(panel);
      if (video) await shoot(panel, still('panel-applied'));
      await panel.close();
      if (video) {
        const again = await answeronce.openPanelFor(job);
        await again.setViewportSize({ width: 400, height: 820 });
        await expect(again.getByRole('region', { name: 'Already applied' })).toBeVisible({ timeout: 30_000 });
        await settle(again);
        await shoot(again, still('panel-already-applied'));
        await mark('panel-already-applied', { warning: again.getByRole('region', { name: 'Already applied' }) });
        await again.close();
      }
      await job.close();

      if (!video) return;

      // --- Applications page ------------------------------------------------
      await options.bringToFront();
      await options.getByRole('navigation').getByRole('button', { name: /^Applications/ }).click();
      await expect(options.getByRole('list', { name: 'Applications' }).getByRole('button', { name: /Senior Frontend Engineer at Fieldstone/ })).toBeVisible({ timeout: 30_000 });
      await dismissToasts(options);
      await settle(options);
      await shoot(options, still('applications'));
      await mark('applications', { list: options.getByRole('list', { name: 'Applications' }) });

      // --- Agent proposals --------------------------------------------------
      const agent = await SimulatedAgent.connect(options);
      await agent.submit({
        client: 'Claude Code',
        summary: 'Add GraphQL Federation and Storybook to skills',
        changes: { skills: { add: ['GraphQL Federation', 'Storybook'] }, headline: 'Senior Frontend Engineer · Design systems' },
      });
      await focusPage(options);
      await options.getByRole('navigation').getByRole('button', { name: 'Overview' }).click();
      const banner = options.getByRole('region', { name: 'Agent proposals' });
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await dismissToasts(options);
      await settle(options);
      await shoot(options, still('overview-proposal'));
      await mark('overview-proposal', { banner });
      await banner.getByRole('button', { name: 'Review changes' }).click();
      await options.getByRole('button', { name: 'Review', exact: true }).click();
      await expect(options.getByText('Proposed by Claude Code', { exact: false })).toBeVisible();
      await settle(options);
      await shoot(options, still('proposal-review'));
      await mark('proposal-review', { accept: options.getByRole('button', { name: /^Accept \d+ changes?$/ }) });

      // --- AI agents settings -----------------------------------------------
      await options.goto(answeronce.url('options.html', '#/agents'));
      await expect(options.getByRole('heading', { name: 'AI agents', level: 1 })).toBeVisible({ timeout: 30_000 });
      await settle(options);
      await shoot(options, still('agents'));
      fs.writeFileSync(path.join(CAPTURES, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`);
    });
  });
}
