import { describe, expect, it } from 'vitest';
import { planFill } from '../../src/application/fill-page';
import type { FrameScan } from '../../src/domain/field';
import { ATS_ADAPTERS } from '../../src/infrastructure/ats';
import { scanDocument } from '../../src/page-agent/detector';
import { resolveLabel } from '../../src/page-agent/label';
import { htmlDocument, loadFixture, sampleProfile } from '../helpers/dom';

function byName(scan: ReturnType<typeof scanDocument>, name: string) {
  const f = scan.fields.find((x) => x.name === name);
  if (!f) throw new Error(`field ${name} not found`);
  return f;
}

function asFrame(doc: Document): FrameScan {
  return { frameId: 0, ...scanDocument(doc) };
}

describe('label resolution', () => {
  it('resolves <label for>, wrapping label, aria-labelledby, aria-label, placeholder and nearby text', () => {
    const doc = htmlDocument(`
      <label for="a">Label For <span>*</span></label><input id="a">
      <label>Wrapping <input id="b"></label>
      <span id="lbl">Labelled By</span><input id="c" aria-labelledby="lbl">
      <input id="d" aria-label="Aria Label">
      <input id="e" placeholder="Placeholder only">
      <div><div class="q">Nearby question text</div><div><input id="f"></div></div>
      <label>Country <select id="g"><option>Spain</option><option>France</option></select></label>
    `);
    const label = (id: string) => resolveLabel(doc.getElementById(id)!);
    expect(label('a')).toBe('Label For');
    expect(label('b')).toBe('Wrapping');
    expect(label('c')).toBe('Labelled By');
    expect(label('d')).toBe('Aria Label');
    expect(label('e')).toBe('Placeholder only');
    expect(label('f')).toBe('Nearby question text');
    expect(label('g')).toBe('Country');
  });
});

describe('Greenhouse fixture', () => {
  const doc = loadFixture('greenhouse.html', 'https://boards.greenhouse.io/acme/jobs/123');
  const scan = scanDocument(doc);

  it('detects fields with their labels and skips hidden/submit inputs', () => {
    expect(byName(scan, 'job_application[first_name]').label).toBe('First Name');
    expect(byName(scan, 'job_application[email]').label).toBe('Email');
    expect(byName(scan, 'job_application[resume]')).toMatchObject({ kind: 'file', label: 'Resume/CV' });
    expect(byName(scan, 'job_application[answers_attributes][0][text_value]').label).toBe('LinkedIn Profile');
    const auth = byName(scan, 'job_application[answers_attributes][2][boolean_value]');
    expect(auth).toMatchObject({ kind: 'select', label: 'Are you legally authorized to work in Spain?', options: ['Yes', 'No'] });
    expect(scan.fields.some((f) => f.name === 'authenticity_token')).toBe(false);
    expect(scan.hints).toContain('greenhouse');
    expect(scan.jobText).toContain('Senior Backend Engineer');
  });

  it('plans a fill: ATS fields, synonyms, documents and unmatched questions', () => {
    const plan = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: false });
    const byField = (name: string) => plan.matches.find((m) => m.field.name === name);
    expect(plan.ats).toBe('Greenhouse');
    expect(byField('job_application[first_name]')).toMatchObject({ source: 'ats', value: { type: 'text', text: 'Ada' } });
    expect(byField('job_application[resume]')).toMatchObject({ key: 'resume', value: { type: 'file', documentId: 'doc-cv' } });
    expect(byField('job_application[answers_attributes][0][text_value]')).toMatchObject({ source: 'synonym', key: 'linkedin' });
    expect(byField('job_application[answers_attributes][2][boolean_value]')?.value).toMatchObject({ type: 'choice' });
    expect(byField('job_application[answers_attributes][3][boolean_value]')?.key).toBe('needsSponsorship');
    const unmatched = plan.unmatched.map((u) => u.field.label);
    expect(unmatched).toContain('Why do you want to work at Acme?');
    expect(plan.unmatched.find((u) => u.field.kind === 'textarea')?.openEnded).toBe(true);
  });
});

describe('Lever fixture', () => {
  const doc = loadFixture('lever.html', 'https://jobs.lever.co/globex/abc-123/apply');
  const scan = scanDocument(doc);

  it('resolves wrapping labels and groups radios under the question', () => {
    expect(byName(scan, 'name').label).toBe('Full name');
    expect(byName(scan, 'urls[LinkedIn]').label).toBe('LinkedIn URL');
    expect(byName(scan, 'resume').label).toBe('Resume/CV');
    const radio = byName(scan, 'cards[f1][field0]');
    expect(radio).toMatchObject({ kind: 'radio', label: '¿Estás dispuesto a reubicarte en Barcelona?', options: ['Sí', 'No'] });
    expect(byName(scan, 'cards[f1][field1]').label).toBe('Pretensión salarial (bruto anual)');
    expect(scan.hints).toContain('lever');
  });

  it('maps Lever fields and Spanish questions', () => {
    const plan = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: false });
    const byField = (name: string) => plan.matches.find((m) => m.field.name === name);
    expect(plan.ats).toBe('Lever');
    expect(byField('name')?.value).toEqual({ type: 'text', text: 'Ada Lovelace' });
    expect(byField('org')?.value).toEqual({ type: 'text', text: 'Analytical Engines Ltd' });
    expect(byField('cards[f1][field0]')).toMatchObject({ key: 'relocation', value: { type: 'choice' } });
    expect(byField('cards[f1][field1]')).toMatchObject({ key: 'expectedSalary', value: { type: 'text', text: '70000 EUR' } });
  });
});

describe('Ashby fixture', () => {
  const doc = loadFixture('ashby.html', 'https://jobs.ashbyhq.com/initech/abc/application');
  const scan = scanDocument(doc);

  it('resolves label[for], radiogroup aria-labelledby and checkbox labels', () => {
    expect(byName(scan, '_systemfield_name').label).toBe('Name');
    expect(byName(scan, '9b1c-phone').label).toBe('Teléfono');
    expect(byName(scan, 'c3d4')).toMatchObject({ kind: 'radio', label: 'Preferred work arrangement', options: ['Remote', 'Hybrid', 'On-site'] });
    expect(byName(scan, 'i9-consent')).toMatchObject({ kind: 'checkbox', label: 'I agree to the processing of my data for recruitment purposes' });
    expect(scan.hints).toContain('ashby');
  });

  it('maps Ashby system fields and generic questions', () => {
    const plan = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: false });
    const byField = (name: string) => plan.matches.find((m) => m.field.name === name);
    expect(plan.ats).toBe('Ashby');
    expect(byField('_systemfield_name')).toMatchObject({ source: 'ats', key: 'fullName' });
    expect(byField('_systemfield_resume')?.key).toBe('resume');
    expect(byField('9b1c-phone')?.key).toBe('phone');
    expect(byField('a1f2-linkedin')?.key).toBe('linkedin');
    expect(byField('c3d4')).toMatchObject({ key: 'workMode', value: { type: 'choice' } });
    expect(byField('e5f6-notice')?.value).toEqual({ type: 'text', text: '30 days' });
    // Consent checkboxes are never auto-ticked.
    expect(byField('i9-consent')).toBeUndefined();
  });

  it('skips fields that already have a value unless overwrite is on', () => {
    (doc.getElementById('_systemfield_email') as HTMLInputElement).value = 'someone@else.com';
    const keep = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: false });
    expect(keep.prefilled.map((p) => p.field.name)).toContain('_systemfield_email');
    const overwrite = planFill([asFrame(doc)], sampleProfile(), ATS_ADAPTERS, { overwrite: true });
    expect(overwrite.matches.map((m) => m.field.name)).toContain('_systemfield_email');
  });
});
