import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import type { AnswerOnce } from './support/answeronce';
import { formValues } from './support/page-values';
import { ADA } from './support/profile';

// Arc flow: the browser exposes chrome.sidePanel but never shows the panel
// (the e2e shim makes sidePanel.open() hang). After waiting for the panel to
// report itself visible, the background injects the panel as a floating frame
// inside the page instead. Fixture pages are served with a strict CSP.

/** Background wait for a visible side panel before falling back (READY_TIMEOUT_MS). */
const SIDE_PANEL_WAIT_MS = 1500;

const overlayHost = (page: Page) => page.locator('#answeronce-overlay-host');

async function openJob(answeronce: AnswerOnce, url: string): Promise<Page> {
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(url);
  return job;
}

/** Clicks the toolbar icon and returns how long the overlay took to appear. */
async function clickAndTimeOverlay(answeronce: AnswerOnce, job: Page): Promise<number> {
  const started = Date.now();
  await answeronce.clickToolbar(job);
  await expect(overlayHost(job)).toBeAttached();
  return Date.now() - started;
}

test('first toolbar click injects the panel into the page and fills it under a strict CSP', async ({ answeronce, fixtureServer }) => {
  const job = await openJob(answeronce, fixtureServer.url('greenhouse.html'));
  const pagesBefore = answeronce.context.pages().length;

  await answeronce.clickToolbar(job);
  await expect(overlayHost(job)).toBeAttached();
  expect(answeronce.context.pages()).toHaveLength(pagesBefore); // no new tab or window

  // The host page cannot reach into the panel.
  expect(await job.evaluate(() => document.getElementById('answeronce-overlay-host')?.shadowRoot ?? null)).toBeNull();

  const panel = await answeronce.panelFrame(job);
  expect(new URL(panel.url()).searchParams.get('embed')).toBe('1');
  await expect(panel.locator('.target-page')).toHaveText(`Filling ${fixtureServer.host}`);

  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
  expect(await formValues(job)).toMatchObject({
    first_name: ADA.firstName,
    last_name: ADA.lastName,
    email: ADA.email,
    phone: ADA.phone,
  });
});

test('second click closes the panel, third reopens it without waiting for the side panel', async ({ answeronce, fixtureServer }) => {
  const job = await openJob(answeronce, fixtureServer.url('lever.html'));

  const first = await clickAndTimeOverlay(answeronce, job);
  expect(first).toBeGreaterThanOrEqual(SIDE_PANEL_WAIT_MS - 100);
  // The side panel failure is remembered for the browser session.
  expect((await answeronce.sessionStorage())['hire.sidePanelBroken']).toBe(true);

  await answeronce.clickToolbar(job);
  await expect(overlayHost(job)).not.toBeAttached();

  const third = await clickAndTimeOverlay(answeronce, job);
  expect(third).toBeLessThan(SIDE_PANEL_WAIT_MS);
  const panel = await answeronce.panelFrame(job);
  await expect(panel.getByRole('button', { name: 'Fill this page' })).toBeVisible();
});

test('the panel refuses to render when framed by another page', async ({ answeronce, fixtureServer }) => {
  const job = await openJob(answeronce, fixtureServer.url('greenhouse.html'));
  await answeronce.clickToolbar(job);
  const committedUrl = (await answeronce.panelFrame(job)).url();

  // The panel is a web accessible resource with use_dynamic_url: the frame
  // commits under the static extension id, and web pages cannot load that URL.
  fixtureServer.serve('static.html', `<!doctype html><h1>Not a job page</h1><iframe src="${committedUrl}"></iframe>`, { csp: null });
  const staticFramer = await answeronce.context.newPage();
  await staticFramer.goto(fixtureServer.url('static.html'));
  await expect.poll(() => staticFramer.frames().map((f) => new URL(f.url()).protocol)).toEqual(['http:', 'chrome-error:']);

  // The per-session dynamic URL can be framed by any page. A page that learns
  // it and frames the panel bound to the job tab gets a refusal instead.
  const dynamicUrl = await answeronce.embeddedPanelUrl(await answeronce.tabIdOf(job));
  fixtureServer.serve('dynamic.html', `<!doctype html><h1>Not a job page</h1><iframe src="${dynamicUrl}"></iframe>`, { csp: null });
  const dynamicFramer = await answeronce.context.newPage();
  await dynamicFramer.goto(fixtureServer.url('dynamic.html'));
  const framed = await answeronce.panelFrame(dynamicFramer);
  await expect(framed.getByText('Open AnswerOnce from the toolbar icon on this page.')).toBeVisible();
  await expect(framed.getByRole('button', { name: 'Fill this page' })).toHaveCount(0);
  await expect(framed.locator('body')).not.toContainText(ADA.lastName);

  // Opened top-level instead of framed, the embedded panel refuses too.
  const topLevel = await answeronce.context.newPage();
  await topLevel.goto(committedUrl);
  await expect(topLevel.getByText('Open AnswerOnce from the toolbar icon on this page.')).toBeVisible();
  await expect(topLevel.getByRole('button', { name: 'Fill this page' })).toHaveCount(0);
});

test('before a folder is chosen, the in-page panel sends setup to the settings tab', async ({ answeronce, fixtureServer }) => {
  // Browsers block file pickers and permission prompts in frames inside web pages.
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('greenhouse.html'));
  await answeronce.clickToolbar(job);
  const panel = await answeronce.panelFrame(job);

  await expect(panel.getByRole('heading', { name: 'Set up AnswerOnce' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Choose folder…' })).toHaveCount(0);
  const [settings] = await Promise.all([answeronce.context.waitForEvent('page'), panel.getByRole('button', { name: 'Open settings' }).click()]);
  await expect(settings).toHaveURL(/\/options\.html/);
});
