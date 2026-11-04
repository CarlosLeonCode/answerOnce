import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import type { AnswerOnce } from './support/answeronce';
import { formValues } from './support/page-values';
import { ADA } from './support/profile';

// Fills the ATS fixtures from the panel opened in its own tab, bound to the
// job tab with ?tabId= (the same page the background opens as a fallback).

async function fillFixture(answeronce: AnswerOnce, url: string): Promise<{ job: Page; panel: Page }> {
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(url);
  const panel = await answeronce.openPanelFor(job);
  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
  return { job, panel };
}

const fullName = `${ADA.firstName} ${ADA.lastName}`;

test('fills a Greenhouse form', async ({ answeronce, fixtureServer }) => {
  const { job, panel } = await fillFixture(answeronce, fixtureServer.url('greenhouse.html'));

  expect(await formValues(job)).toEqual({
    first_name: ADA.firstName,
    last_name: ADA.lastName,
    email: ADA.email,
    phone: ADA.phone,
    job_application_location: ADA.location,
    resume: '', // no CV in the profile yet
    job_application_answers_attributes_0_text_value: ADA.linkedin,
    job_application_answers_attributes_1_text_value: ADA.portfolio,
    job_application_answers_attributes_2_boolean_value: '1', // authorized to work in Spain
    job_application_answers_attributes_3_boolean_value: '0', // no sponsorship needed
    job_application_answers_attributes_4_text_value: '', // open question, left for the user or AI
    job_application_answers_attributes_5_text_value: '',
  });
  await expect(panel.getByText('Greenhouse', { exact: true })).toBeVisible();
  const needsInput = panel.getByRole('region', { name: 'Needs your input' });
  await expect(needsInput.getByText('Why do you want to work at Acme?')).toBeVisible();
  await expect(needsInput.getByText('How did you hear about this job?')).toBeVisible();
});

test('fills a Lever form', async ({ answeronce, fixtureServer }) => {
  const { job, panel } = await fillFixture(answeronce, fixtureServer.url('lever.html'));

  expect(await formValues(job)).toEqual({
    'resume-upload-input': '',
    name: fullName,
    email: ADA.email,
    phone: ADA.phone,
    org: ADA.company,
    'urls[LinkedIn]': ADA.linkedin,
    'urls[GitHub]': ADA.github,
    'urls[Portfolio]': ADA.portfolio,
    'cards[f1][field0]': 'Sí', // Spanish relocation question, willing to relocate
    'cards[f1][field1]': `${ADA.expectedSalary} ${ADA.salaryCurrency}`,
    comments: '',
  });
  await expect(panel.getByText('Lever', { exact: true })).toBeVisible();
});

test('fills an Ashby form', async ({ answeronce, fixtureServer }) => {
  const { job, panel } = await fillFixture(answeronce, fixtureServer.url('ashby.html'));

  const values = await formValues(job);
  expect(values).toMatchObject({
    _systemfield_name: fullName,
    _systemfield_email: ADA.email,
    _systemfield_resume: '',
    '9b1c-phone': ADA.phone, // "Teléfono"
    'a1f2-linkedin': ADA.linkedin, // "Perfil de LinkedIn"
    c3d4: 'remote',
    'e5f6-notice': ADA.noticePeriod,
    'i9-consent': 'unchecked',
  });
  await expect(panel.getByText('Ashby', { exact: true })).toBeVisible();
});

test('leaves an open question alone even when its id mentions a profile field', async ({ answeronce, fixtureServer }) => {
  // Regression: the Ashby textarea "Tell us about a project you are proud of"
  // has id/name "g7h8-portfolio"; the visible label must win over the id.
  const { job } = await fillFixture(answeronce, fixtureServer.url('ashby.html'));
  expect((await formValues(job))['g7h8-portfolio']).toBe('');
});
