import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { FIXTURES_DIR } from './support/extension';
import { expect, test } from './support/fixtures';
import type { AnswerOnce } from './support/answeronce';
import { CV_MODEL_JSON, CV_SECRETS } from './support/profile';

// CV import from the onboarding screen: text is extracted locally, structured
// either offline (basic) or by an AI provider (a stub Ollama here), reviewed,
// then saved as one profile.json write plus a copy of the CV in documents/.

const saveButton = (page: Page) => page.getByRole('button', { name: /^Save \d+ changes? to profile$/ });

async function uploadFromOnboarding(answeronce: AnswerOnce, file: string): Promise<Page> {
  const options = await answeronce.setUpFolder();
  await options.getByRole('button', { name: 'Import your CV' }).click();
  await expect(options.getByRole('heading', { name: 'Upload your CV' })).toBeVisible();
  await options.getByLabel('Choose CV file').setInputFiles(path.join(FIXTURES_DIR, file));
  await expect(options.getByText('Text extracted')).toBeVisible({ timeout: 30_000 });
  return options;
}

/** The folder holds a readable profile.json and an exact copy of the CV in documents/. */
async function expectPlainFolder(answeronce: AnswerOnce, extension: string): Promise<void> {
  const files = await answeronce.folderFiles();
  expect(files.map((f) => f.name)).toEqual([expect.stringMatching(new RegExp(`^documents/sample-cv-[0-9a-f]{8}\\.${extension}$`)), 'profile.json', 'settings.json']);
  expect(files[0]!.size).toBe(fs.statSync(path.join(FIXTURES_DIR, `sample-cv.${extension}`)).size);
  const profile = JSON.parse(files[1]!.text) as { personal: Record<string, string>; documents: { storedAs: string }[] };
  expect(profile.personal).toMatchObject({ firstName: 'Jordan', email: 'jordan.rivera@example.com' });
  expect(profile.documents.map((d) => d.storedAs)).toEqual([files[0]!.name]);
  for (const secret of CV_SECRETS) expect(files[2]!.text, `settings.json must not contain "${secret}"`).not.toContain(secret);
}

test('DOCX with basic extraction: contact details and the file as default resume', async ({ answeronce }) => {
  const options = await uploadFromOnboarding(answeronce, 'sample-cv.docx');

  await options.getByRole('radio', { name: /Basic extraction/ }).check();
  await options.getByRole('button', { name: 'Extract basic details' }).click();
  await expect(options.getByText('Basic extraction from sample-cv.docx')).toBeVisible({ timeout: 30_000 });
  await expect(options.getByLabel('Email from CV')).toHaveValue('jordan.rivera@example.com');
  await saveButton(options).click();
  await expect(options.getByText('Profile updated from your CV')).toBeVisible({ timeout: 30_000 });

  const profile = (await answeronce.session())!.profile;
  expect(profile.personal).toMatchObject({ firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@example.com', phone: '+351 912 345 678' });
  expect(profile.links).toMatchObject({
    linkedin: 'https://linkedin.com/in/jordan-rivera-dev',
    github: 'https://github.com/jrivera-dev',
    portfolio: 'https://jordanrivera.dev',
  });
  // Basic extraction leaves experience and education to the user.
  expect(profile.experience).toEqual([]);
  expect(profile.education).toEqual([]);
  expect(profile.documents).toEqual([expect.objectContaining({ kind: 'cv', fileName: 'sample-cv.docx' })]);
  expect(profile.defaultResumeId).toBe(profile.documents[0]!.id);

  await expectPlainFolder(answeronce, 'docx');
});

test('PDF structured by a local Ollama: review, accept all, save', async ({ answeronce, startOllama }) => {
  const ollama = await startOllama((request) => (request.format === 'json' ? JSON.stringify(CV_MODEL_JSON) : ''));
  const options = await uploadFromOnboarding(answeronce, 'sample-cv.pdf');

  await options.getByRole('radio', { name: /Structure with AI/ }).check();
  await options.getByRole('radio', { name: /Ollama/ }).check();
  await options.getByLabel('Ollama URL').fill(ollama.baseUrl);
  await options.getByLabel('Model', { exact: true }).fill('llama3.2');
  await options.getByRole('button', { name: 'Extract with Ollama' }).click();

  await expect(saveButton(options)).toBeVisible({ timeout: 30_000 });
  expect(ollama.requests).toHaveLength(1);
  const [request] = ollama.requests;
  expect(request).toMatchObject({ model: 'llama3.2', stream: false, format: 'json' });
  expect(request!.messages.map((m) => m.content).join('\n')).toContain('Lumen Analytics'); // the CV text, extracted locally

  await expect(options.getByText('Structured by Ollama from sample-cv.pdf', { exact: false })).toBeVisible();
  await expect(options.getByRole('region', { name: 'Experience' }).getByText('Senior Frontend Engineer · Lumen Analytics')).toBeVisible();
  await expect(options.getByRole('region', { name: 'Education' }).getByText('Universidade de Lisboa')).toBeVisible();
  await options.getByRole('button', { name: 'Accept all' }).click();
  await saveButton(options).click();
  await expect(options.getByText('Profile updated from your CV')).toBeVisible({ timeout: 30_000 });

  const profile = (await answeronce.session())!.profile;
  expect(profile.personal).toMatchObject({ firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@example.com', city: 'Lisbon' });
  expect(profile.headline).toBe('Senior Frontend Engineer');
  expect(profile.experience.map((e) => [e.title, e.company, e.current])).toEqual([
    ['Senior Frontend Engineer', 'Lumen Analytics', true],
    ['Frontend Developer', 'Northwind Labs', false],
  ]);
  expect(profile.education).toEqual([expect.objectContaining({ school: 'Universidade de Lisboa', degree: 'BSc', field: 'Computer Science' })]);
  expect(profile.skills).toEqual(expect.arrayContaining(CV_MODEL_JSON.skills));
  expect(profile.ai).toMatchObject({ provider: 'ollama', model: 'llama3.2', ollamaBaseUrl: ollama.baseUrl });
  expect(profile.documents).toEqual([expect.objectContaining({ kind: 'cv', fileName: 'sample-cv.pdf' })]);
  expect(profile.defaultResumeId).toBe(profile.documents[0]!.id);

  // The Documents page marks the imported PDF as the default resume.
  await options.getByRole('navigation').getByRole('button', { name: 'Documents' }).click();
  const pdfRow = options.locator('.doc-row', { hasText: 'sample-cv.pdf' });
  await expect(pdfRow.getByText('Default resume')).toBeVisible();

  await expectPlainFolder(answeronce, 'pdf');
});
