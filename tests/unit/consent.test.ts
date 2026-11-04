import { describe, expect, it } from 'vitest';
import { planFill } from '../../src/application/fill-page';
import { isConsentField } from '../../src/domain/consent';
import type { FieldDescriptor, FieldKind, FrameScan } from '../../src/domain/field';
import { ATS_ADAPTERS } from '../../src/infrastructure/ats';
import { scanDocument } from '../../src/page-agent/detector';
import { applyInstructions } from '../../src/page-agent/filler';
import { htmlDocument, loadFixture, sampleProfile } from '../helpers/dom';

function field(label: string, kind: FieldKind = 'checkbox', overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    uid: 'u1',
    kind,
    label,
    name: '',
    htmlId: '',
    placeholder: '',
    ariaLabel: '',
    autocomplete: '',
    options: [],
    required: false,
    currentValue: '',
    accept: '',
    ...overrides,
  };
}

const asFrame = (doc: Document): FrameScan => ({ frameId: 0, ...scanDocument(doc) });

describe('isConsentField', () => {
  it.each([
    'I agree to the processing of my data for recruitment purposes',
    'I have read and accept the Terms and Conditions',
    'I acknowledge the Privacy Policy',
    'By checking this box you consent to our GDPR notice',
    'I certify that the information provided is true and complete',
    'I hereby authorize a background check',
    'Send me job alerts and newsletter updates',
    'Acepto los términos y condiciones',
    'Consiento el tratamiento de mis datos personales',
    'He leído la política de privacidad',
    'Autorizo el uso de mis datos',
    '¿Autorizas el tratamiento de tus datos personales?',
    '¿Aceptas la política de privacidad?',
  ])('detects consent: %s', (label) => {
    expect(isConsentField(field(label))).toBe(true);
  });

  it('detects consent in yes/no selects and radio groups', () => {
    expect(isConsentField(field('Do you consent to us storing your CV?', 'select', { options: ['Yes', 'No'] }))).toBe(true);
    expect(isConsentField(field('Privacy notice acknowledgement', 'radio', { options: ['Yes', 'No'] }))).toBe(true);
  });

  it('treats e-signature text fields as consent', () => {
    expect(isConsentField(field('Electronic signature (type your full name)', 'text'))).toBe(true);
    expect(isConsentField(field('Firma electrónica', 'text'))).toBe(true);
  });

  it.each([
    ['Are you legally authorized to work in Spain?', 'select'],
    ['Will you now or in the future require sponsorship?', 'select'],
    ['Are you willing to relocate?', 'radio'],
    ['Email', 'email'],
    ['Why do you want to work at Acme?', 'textarea'],
    ['Remote', 'checkbox'],
    ['¿Estás autorizado para trabajar en España?', 'select'],
  ] as const)('does not flag normal questions: %s', (label, kind) => {
    expect(isConsentField(field(label, kind, { options: kind === 'select' ? ['Yes', 'No'] : [] }))).toBe(false);
  });

  it('does not flag a free-text field just because it mentions privacy', () => {
    expect(isConsentField(field('Anything about privacy engineering you want to share?', 'textarea'))).toBe(false);
  });
});

describe('consent guard in the fill plan', () => {
  it('leaves the Ashby consent checkbox to the user', () => {
    const doc = loadFixture('ashby.html', 'https://jobs.ashbyhq.com/acme/123/application');
    const plan = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: false });
    const consentLabels = plan.consent.map((c) => c.field.label);
    expect(consentLabels.some((l) => /processing of my data/i.test(l))).toBe(true);
    expect(plan.matches.some((m) => /processing of my data/i.test(m.field.label))).toBe(false);
    expect(plan.unmatched.some((u) => /processing of my data/i.test(u.field.label))).toBe(false);
  });

  it('never uses saved answers for consent fields', () => {
    const doc = htmlDocument(`
      <input type="checkbox" id="t" name="terms"><label for="t">I accept the terms and conditions</label>
    `);
    const profile = sampleProfile();
    profile.savedAnswers = [{ id: 'a1', label: 'I accept the terms and conditions', answer: 'Yes', updatedAt: '2026-01-01T00:00:00Z' }];
    const plan = planFill([asFrame(doc)], profile, ATS_ADAPTERS, { overwrite: true });
    expect(plan.matches).toHaveLength(0);
    expect(plan.consent).toHaveLength(1);
  });
});

describe('consent guard in the page filler', () => {
  it('refuses to tick a consent checkbox even when instructed to', async () => {
    const doc = htmlDocument(`
      <input type="checkbox" id="c" data-answeronce-uid="c1"><label for="c">I agree to the privacy policy</label>
      <input type="checkbox" id="r" data-answeronce-uid="r1"><label for="r">Remote</label>
    `);
    const results = await applyInstructions(
      doc,
      [
        { uid: 'c1', value: { type: 'bool', value: true } },
        { uid: 'r1', value: { type: 'bool', value: true } },
      ],
      { overwrite: true },
    );
    expect(results.find((r) => r.uid === 'c1')?.status).toBe('skipped-consent');
    expect(doc.querySelector<HTMLInputElement>('#c')!.checked).toBe(false);
    expect(results.find((r) => r.uid === 'r1')?.status).toBe('filled');
    expect(doc.querySelector<HTMLInputElement>('#r')!.checked).toBe(true);
  });

  it('refuses a consent select inside a fieldset legend', async () => {
    const doc = htmlDocument(`
      <fieldset><legend>Acepto el tratamiento de mis datos</legend>
        <select data-answeronce-uid="s1"><option value="">--</option><option>Sí</option><option>No</option></select>
      </fieldset>
    `);
    const [result] = await applyInstructions(doc, [{ uid: 's1', value: { type: 'choice', candidates: ['Sí'] } }], { overwrite: true });
    expect(result!.status).toBe('skipped-consent');
    expect(doc.querySelector('select')!.value).toBe('');
  });
});
