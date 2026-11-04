import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import type { AnswerOnce } from './support/answeronce';

// Every job filled from the panel is recorded in applications.json, next to
// profile.json in the folder. "Mark as applied" snapshots the final answers
// (never consent fields or files); the options page lists the applications.

interface ApplicationsJson {
  rev: number;
  schemaVersion: number;
  applications: {
    id: string;
    url: string;
    normalizedUrl: string;
    company: string;
    role: string;
    ats: string;
    status: string;
    statusHistory: { status: string; at: string }[];
    notes: string;
    answers: { label: string; value: string }[];
  }[];
}

async function folderFile(answeronce: AnswerOnce, name: string): Promise<string | undefined> {
  return (await answeronce.folderFiles()).find((f) => f.name === name)?.text;
}

async function applicationsJson(answeronce: AnswerOnce): Promise<ApplicationsJson> {
  const text = await folderFile(answeronce, 'applications.json');
  if (text === undefined) throw new Error('applications.json is missing from the folder');
  return JSON.parse(text) as ApplicationsJson;
}

/** Clicks "Fill this page" and waits until the fill and its application record are done. */
async function fill(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('button', { name: 'Fill this page' })).toBeEnabled({ timeout: 30_000 });
}

async function fillFrom(answeronce: AnswerOnce, job: Page): Promise<Page> {
  const panel = await answeronce.openPanelFor(job);
  await fill(panel);
  return panel;
}

test('fill records the job; Mark as applied snapshots the answers and it shows on the Applications page', async ({ answeronce, fixtureServer }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const profileRev = (await answeronce.session())!.revision;
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('ashby.html'));
  const panel = await fillFrom(answeronce, job);

  // The record is created on fill, with company and role read from the page.
  const card = panel.getByRole('region', { name: 'This application' });
  await expect(card).toContainText('Product Designer at Initech');
  await expect(card).toContainText('Filled');
  await expect.poll(async () => (await applicationsJson(answeronce)).applications.length).toBe(1);
  const filled = (await applicationsJson(answeronce)).applications[0]!;
  expect(filled).toMatchObject({ company: 'Initech', role: 'Product Designer', ats: 'ashby', status: 'filled', url: fixtureServer.url('ashby.html') });

  // The user finishes the form on the site: answers the open question, ticks
  // the consent box and attaches a file. Then submits it and marks it applied.
  await job.locator('#g7h8-portfolio').fill('The Analytical Engine.');
  await job.locator('#i9-consent').check();
  await job.locator('#_systemfield_resume').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await card.getByRole('button', { name: 'Mark as applied' }).click();
  await expect(panel.getByText('Marked as applied')).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('Applied');

  const applied = (await applicationsJson(answeronce)).applications[0]!;
  expect(applied).toMatchObject({ id: filled.id, status: 'applied' });
  expect(applied.statusHistory.map((h) => h.status)).toEqual(['filled', 'applied']);
  expect(applied.answers).toEqual(
    expect.arrayContaining([
      { label: 'Name', value: 'Ada Lovelace' },
      { label: 'Tell us about a project you are proud of', value: 'The Analytical Engine.' },
      { label: 'Preferred work arrangement', value: 'Remote' },
    ]),
  );
  // Never consent fields or file inputs.
  const answers = JSON.stringify(applied.answers);
  expect(answers).not.toContain('I agree to the processing of my data');
  expect(answers).not.toMatch(/Resume|resume\.pdf/);

  // Company and role can be corrected from the panel.
  await card.getByRole('button', { name: 'Edit company and role' }).click();
  await card.getByLabel('Role').fill('Senior Product Designer');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card).toContainText('Senior Product Designer at Initech');
  await expect.poll(async () => (await applicationsJson(answeronce)).applications[0]!.role).toBe('Senior Product Designer');

  // Application updates never touch profile.json.
  expect((await answeronce.session())!.revision).toBe(profileRev);

  // The options page (already open) picks the record up.
  await options.bringToFront();
  await options.getByRole('navigation').getByRole('button', { name: /^Applications/ }).click();
  const list = options.getByRole('list', { name: 'Applications' });
  const row = list.getByRole('button', { name: /Senior Product Designer at Initech/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Applied');

  // Search and status filter.
  await options.getByLabel('Search applications').fill('globex');
  await expect(options.getByText('No applications match these filters.')).toBeVisible();
  await options.getByLabel('Search applications').fill('initech');
  await options.getByLabel('Filter by status').selectOption('applied');
  await expect(row).toBeVisible();
  await options.getByLabel('Filter by status').selectOption('rejected');
  await expect(options.getByText('No applications match these filters.')).toBeVisible();
  await options.getByLabel('Filter by status').selectOption('');

  // Detail: answers snapshot, status change, notes.
  await row.click();
  await expect(options.getByRole('heading', { name: 'Senior Product Designer at Initech' })).toBeVisible();
  await expect(options.getByRole('definition').filter({ hasText: 'The Analytical Engine.' })).toBeVisible();
  await expect(options.getByRole('link', { name: 'Open job' })).toHaveAttribute('href', fixtureServer.url('ashby.html'));
  await options.getByLabel('Status', { exact: true }).selectOption('interview');
  await expect(options.getByText('Status updated')).toBeVisible({ timeout: 30_000 });
  await options.getByLabel('Notes').fill('Portfolio review on Friday.');
  await options.getByRole('button', { name: 'Save notes' }).click();
  await expect(options.getByText('Notes saved')).toBeVisible({ timeout: 30_000 });
  const updated = (await applicationsJson(answeronce)).applications[0]!;
  expect(updated).toMatchObject({ status: 'interview', notes: 'Portfolio review on Friday.' });
  expect(updated.statusHistory.map((h) => h.status)).toEqual(['filled', 'applied', 'interview']);

  // Delete, with confirmation.
  await options.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = options.getByRole('dialog', { name: 'Delete this application?' });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(options.getByText('No applications yet')).toBeVisible({ timeout: 30_000 });
  expect((await applicationsJson(answeronce)).applications).toEqual([]);
});

test('reopening the panel on a job already applied to warns, whatever the tracking parameters', async ({ answeronce, fixtureServer }) => {
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('greenhouse.html'));
  const panel = await fillFrom(answeronce, job);
  // No warning before applying.
  await expect(panel.getByRole('region', { name: 'Already applied' })).toHaveCount(0);
  await panel.getByRole('region', { name: 'This application' }).getByRole('button', { name: 'Mark as applied' }).click();
  await expect(panel.getByText('Marked as applied')).toBeVisible({ timeout: 30_000 });
  await panel.close();

  // Later, the same posting from another link.
  await job.goto(fixtureServer.url('greenhouse.html?utm_source=linkedin&gh_src=abc#app'));
  const again = await answeronce.openPanelFor(job);
  const today = await again.evaluate(() => new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const warning = again.getByRole('region', { name: 'Already applied' });
  await expect(warning).toContainText(`You already applied here on ${today}`, { timeout: 30_000 });
  await expect(warning).toContainText('Senior Backend Engineer at Acme · Applied');

  // Filling again updates the same record instead of adding one.
  await fill(again);
  await expect(again.getByRole('region', { name: 'This application' })).toContainText('Applied');
  const file = await applicationsJson(answeronce);
  expect(file.applications).toHaveLength(1);
  expect(file.applications[0]!.status).toBe('applied');

  // Another posting: no warning.
  const other = await answeronce.context.newPage();
  await other.goto(fixtureServer.url('lever.html'));
  const otherPanel = await answeronce.openPanelFor(other);
  await expect(otherPanel.getByRole('button', { name: 'Fill this page' })).toBeVisible({ timeout: 30_000 });
  await expect(otherPanel.getByRole('region', { name: 'Already applied' })).toHaveCount(0);
});

test('applications.json is plain, readable JSON in the folder, separate from profile.json', async ({ answeronce, fixtureServer }) => {
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const profileBefore = await folderFile(answeronce, 'profile.json');
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('greenhouse.html'));
  await fillFrom(answeronce, job);
  await expect.poll(async () => (await answeronce.folderFiles()).map((f) => f.name)).toEqual(['applications.json', 'profile.json', 'settings.json']);

  const text = (await folderFile(answeronce, 'applications.json'))!;
  // Pretty-printed, own revision first, so a person can read and edit it.
  expect(text).toMatch(/^\{\n {2}"rev": 1,\n {2}"schemaVersion": 1,\n {2}"applications": \[\n/);
  const file = JSON.parse(text) as ApplicationsJson;
  expect(file.applications).toEqual([
    expect.objectContaining({
      url: fixtureServer.url('greenhouse.html'),
      normalizedUrl: fixtureServer.url('greenhouse.html'),
      company: 'Acme',
      role: 'Senior Backend Engineer',
      ats: 'greenhouse',
      status: 'filled',
      notes: '',
    }),
  ]);
  expect(file.applications[0]!.answers).toEqual(expect.arrayContaining([{ label: 'First Name', value: 'Ada' }]));
  // The profile file is untouched by application records.
  expect(await folderFile(answeronce, 'profile.json')).toBe(profileBefore);
  expect(profileBefore).not.toContain('applications');
});

test('after folder access lapses, the options page asks to reconnect instead of showing no applications', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const app = {
    id: 'a1',
    url: 'https://jobs.example.com/acme/1',
    normalizedUrl: 'https://jobs.example.com/acme/1',
    company: 'Acme',
    role: 'Frontend Engineer',
    ats: 'generic',
    createdAt: '2026-11-03T10:00:00.000Z',
    status: 'applied',
    statusHistory: [{ status: 'applied', at: '2026-11-03T10:00:00.000Z' }],
    notes: '',
    answers: [],
  };
  await answeronce.writeFolderFile('applications.json', JSON.stringify({ rev: 1, schemaVersion: 1, applications: [app] }));
  await options.close();

  // Chrome drops the folder grant when the last AnswerOnce page closes, but the
  // cached session survives. Simulate the lapsed grant in a new page.
  const page = await answeronce.context.newPage();
  await page.addInitScript(() => {
    let granted = false;
    FileSystemHandle.prototype.queryPermission = async () => (granted ? 'granted' : 'prompt');
    FileSystemHandle.prototype.requestPermission = async () => ((granted = true), 'granted');
  });
  await page.goto(answeronce.url('options.html', '#/applications'));
  await expect(page.getByRole('heading', { name: 'Reconnect your profile folder' })).toBeVisible();
  await expect(page.getByText('No applications yet')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reconnect folder' }).click();
  await expect(page.getByText('Frontend Engineer')).toBeVisible();
});
