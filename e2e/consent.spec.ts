import { expect, test } from './support/fixtures';
import { formValues } from './support/page-values';
import { ADA } from './support/profile';

// AnswerOnce never answers consent, terms, privacy, opt-in or e-signature fields
// (English and Spanish). The panel lists them under "Left to you".

test('Ashby: the data processing consent stays unticked and is left to the user', async ({ answeronce, fixtureServer }) => {
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('ashby.html'));
  const panel = await answeronce.openPanelFor(job);

  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });

  expect(await formValues(job)).toMatchObject({ _systemfield_email: ADA.email, 'i9-consent': 'unchecked' });
  await expect(job.locator('#i9-consent')).not.toBeChecked();
  const leftToYou = panel.locator('.result-group', { has: panel.getByRole('button', { name: /Left to you/ }) });
  await expect(leftToYou.getByRole('button', { name: /Left to you/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(leftToYou.getByRole('listitem')).toHaveCount(1);
  await expect(leftToYou.getByRole('listitem')).toContainText('I agree to the processing of my data for recruitment purposes');
});

const CONSENT_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Apply: Data Engineer</title></head>
<body>
<form>
  <label for="first">First name</label><input id="first" name="first_name">
  <label for="email">Email</label><input id="email" name="email" type="email">

  <h2>English</h2>
  <input id="en-terms" name="terms" type="checkbox"><label for="en-terms">I accept the Terms and Conditions</label>
  <label for="en-marketing">Would you like to receive updates about future openings?</label>
  <select id="en-marketing" name="marketing"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  <label for="en-signature">Electronic signature (type your full name)</label><input id="en-signature" name="signature">

  <h2>Español</h2>
  <input id="es-privacy" name="privacidad" type="checkbox"><label for="es-privacy">He leído y acepto la política de privacidad</label>
  <label for="es-data">¿Aceptas el tratamiento de sus datos personales?</label>
  <select id="es-data" name="tratamiento"><option value="">Selecciona…</option><option>Sí</option><option>No</option></select>
  <label for="es-signature">Firma electrónica (escribe tu nombre completo)</label><input id="es-signature" name="firma">

  <button type="submit">Submit</button>
</form>
</body>
</html>`;

test('English and Spanish consent checkboxes, selects and e-signatures are never filled', async ({ answeronce, fixtureServer }) => {
  fixtureServer.serve('consent.html', CONSENT_PAGE);
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('consent.html'));
  const panel = await answeronce.openPanelFor(job);

  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });

  expect(await formValues(job)).toEqual({
    // Ordinary fields on the same form are filled.
    first: ADA.firstName,
    email: ADA.email,
    // Consent fields are untouched.
    'en-terms': 'unchecked',
    'en-marketing': '',
    'en-signature': '',
    'es-privacy': 'unchecked',
    'es-data': '',
    'es-signature': '',
  });

  const leftToYou = panel.locator('.result-group', { has: panel.getByRole('button', { name: /Left to you/ }) });
  const items = leftToYou.getByRole('listitem');
  await expect(items).toHaveCount(6);
  for (const label of [
    'I accept the Terms and Conditions',
    'Would you like to receive updates about future openings?',
    'Electronic signature (type your full name)',
    'He leído y acepto la política de privacidad',
    '¿Aceptas el tratamiento de sus datos personales?',
    'Firma electrónica (escribe tu nombre completo)',
  ]) {
    await expect(items.filter({ hasText: label })).toHaveCount(1);
  }
});

test('informal Spanish data processing consent ("tus datos") is left to the user', async ({ answeronce, fixtureServer }) => {
  // Regression: informal Spanish ("tus datos", "¿Autorizas...?") must be
  // treated as consent and listed under "Left to you", never offered to AI.
  fixtureServer.serve(
    'consent-informal.html',
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Candidatura</title></head><body><form>
      <label for="es-data">¿Autorizas el tratamiento de tus datos personales?</label>
      <select id="es-data" name="tratamiento"><option value="">Selecciona…</option><option>Sí</option><option>No</option></select>
    </form></body></html>`,
  );
  const options = await answeronce.setUpFolderWithProfile();
  await options.close();
  const job = await answeronce.context.newPage();
  await job.goto(fixtureServer.url('consent-informal.html'));
  const panel = await answeronce.openPanelFor(job);

  await panel.getByRole('button', { name: 'Fill this page' }).click();
  await expect(panel.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });

  expect((await formValues(job))['es-data']).toBe('');
  await expect(panel.getByRole('region', { name: 'Needs your input' })).toHaveCount(0, { timeout: 2_000 });
  const leftToYou = panel.locator('.result-group', { has: panel.getByRole('button', { name: /Left to you/ }) });
  await expect(leftToYou.getByRole('listitem')).toContainText('¿Autorizas el tratamiento de tus datos personales?', { timeout: 2_000 });
});
