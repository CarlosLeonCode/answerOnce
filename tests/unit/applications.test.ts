import { describe, expect, it } from 'vitest';
import {
  advanceToApplied,
  appliedAt,
  applicationTitle,
  changeStatus,
  countAppliedSince,
  filterApplications,
  findByUrl,
  hasApplied,
  mergeAnswers,
  newApplication,
  normalizeJobUrl,
  patchApplication,
  recordApplied,
  recordFill,
  snapshotAnswers,
  startOfWeek,
  type Application,
} from '../../src/domain/applications';
import type { FieldDescriptor, FieldKind } from '../../src/domain/field';
import { collectFields } from '../../src/page-agent/detector';
import { htmlDocument, loadFixture } from '../helpers/dom';

let seq = 0;
const ids = () => `app-${++seq}`;
const T1 = '2026-10-03T10:00:00.000Z';
const T2 = '2026-10-05T12:00:00.000Z';
const job = (url: string, extra: Partial<{ company: string; role: string; ats: string }> = {}) => ({ url, company: 'Acme', role: 'Engineer', ats: 'greenhouse', ...extra });

function field(kind: FieldKind, label: string, currentValue: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return { uid: `u-${label}`, kind, label, name: '', htmlId: '', placeholder: '', ariaLabel: '', autocomplete: '', options: [], required: false, currentValue, accept: '', ...extra };
}

describe('normalizeJobUrl', () => {
  it('strips the hash and tracking parameters', () => {
    expect(normalizeJobUrl('https://boards.greenhouse.io/acme/jobs/123?utm_source=linkedin&utm_medium=social&gh_src=abc#app')).toBe('https://boards.greenhouse.io/acme/jobs/123');
    expect(normalizeJobUrl('https://jobs.lever.co/globex/abc-123?lever-source=LinkedIn&lever-origin=applied&ref=x&fbclid=1&gclid=2')).toBe('https://jobs.lever.co/globex/abc-123');
  });

  it('keeps ATS job ids in the query and sorts the remaining parameters', () => {
    expect(normalizeJobUrl('https://acme.com/careers?utm_campaign=x&gh_jid=4567890')).toBe('https://acme.com/careers?gh_jid=4567890');
    expect(normalizeJobUrl('https://initech.com/jobs?ashby_jid=9f8e&team=design')).toBe('https://initech.com/jobs?ashby_jid=9f8e&team=design');
    expect(normalizeJobUrl('https://acme.com/jobs?b=2&a=1')).toBe(normalizeJobUrl('https://acme.com/jobs?a=1&b=2'));
    // Different job ids stay different.
    expect(normalizeJobUrl('https://acme.com/careers?gh_jid=1')).not.toBe(normalizeJobUrl('https://acme.com/careers?gh_jid=2'));
  });

  it('lowercases the host, drops www. and trailing slashes, and folds ATS apply pages into the posting', () => {
    expect(normalizeJobUrl('https://WWW.Acme.com/Jobs/42/')).toBe('https://acme.com/Jobs/42');
    expect(normalizeJobUrl('https://jobs.lever.co/globex/abc-123/apply')).toBe('https://jobs.lever.co/globex/abc-123');
    expect(normalizeJobUrl('https://jobs.ashbyhq.com/initech/7c1d/application?utm_source=x')).toBe('https://jobs.ashbyhq.com/initech/7c1d');
    expect(normalizeJobUrl('https://acme.com/')).toBe('https://acme.com/');
    expect(normalizeJobUrl('http://localhost:5173/greenhouse.html#x')).toBe('http://localhost:5173/greenhouse.html');
  });

  it('returns non-http strings unchanged (trimmed)', () => {
    expect(normalizeJobUrl('  not a url ')).toBe('not a url');
    expect(normalizeJobUrl('chrome://extensions')).toBe('chrome://extensions');
  });
});

describe('duplicate lookup', () => {
  it('finds the record of the same posting whatever the tracking parameters or hash', () => {
    const app = newApplication(job('https://boards.greenhouse.io/acme/jobs/123'), 'applied', T1, 'a1');
    const other = newApplication(job('https://boards.greenhouse.io/acme/jobs/999'), 'filled', T2, 'a2');
    expect(findByUrl([other, app], 'https://boards.greenhouse.io/acme/jobs/123?utm_source=x#app')?.id).toBe('a1');
    expect(findByUrl([other, app], 'https://boards.greenhouse.io/acme/jobs/124')).toBeUndefined();
  });

  it('recordFill updates the existing record instead of creating a duplicate', () => {
    const first = recordFill([], job('https://jobs.lever.co/globex/abc'), [{ label: 'Email', value: 'a@x.com' }], T1, ids);
    expect(first.created).toBe(true);
    expect(first.application).toMatchObject({ status: 'filled', statusHistory: [{ status: 'filled', at: T1 }], normalizedUrl: 'https://jobs.lever.co/globex/abc' });

    const second = recordFill(first.applications, job('https://jobs.lever.co/globex/abc/apply?lever-source=x', { company: 'Other', role: 'Other' }), [
      { label: 'email', value: 'b@x.com' },
      { label: 'Phone', value: '123' },
    ], T2, ids);
    expect(second.created).toBe(false);
    expect(second.applications).toHaveLength(1);
    // Answers merged by label; company/role already known are kept.
    expect(second.application).toMatchObject({ id: first.application.id, company: 'Acme', role: 'Engineer', createdAt: T1 });
    expect(second.application.answers).toEqual([
      { label: 'email', value: 'b@x.com' },
      { label: 'Phone', value: '123' },
    ]);
  });

  it('a later fill fills in a missing company or role, but never overwrites one', () => {
    const first = recordFill([], job('https://x.com/j', { company: '', role: 'Engineer' }), [], T1, ids);
    const second = recordFill(first.applications, job('https://x.com/j', { company: 'Acme', role: 'Changed' }), [], T2, ids);
    expect(second.application).toMatchObject({ company: 'Acme', role: 'Engineer' });
  });
});

describe('status transitions', () => {
  const base = () => newApplication(job('https://acme.com/j'), 'filled', T1, 'a1');

  it('records every change in the history and ignores setting the same status', () => {
    let app = changeStatus(base(), 'applied', T2);
    app = changeStatus(app, 'applied', '2026-10-06T00:00:00Z');
    app = changeStatus(app, 'interview', '2026-10-10T00:00:00Z');
    expect(app.status).toBe('interview');
    expect(app.statusHistory.map((h) => h.status)).toEqual(['filled', 'applied', 'interview']);
    expect(appliedAt(app)).toBe(T2);
  });

  it('allows corrections back to an earlier status', () => {
    const app = changeStatus(changeStatus(base(), 'rejected', T2), 'interview', '2026-10-07T00:00:00Z');
    expect(app.statusHistory.map((h) => h.status)).toEqual(['filled', 'rejected', 'interview']);
  });

  it('marking as applied never moves a later status back', () => {
    const interview = changeStatus(base(), 'interview', T2);
    expect(advanceToApplied(interview, '2026-10-08T00:00:00Z')).toBe(interview);
    expect(advanceToApplied(base(), T2).status).toBe('applied');
    expect(['filled', 'applied', 'interview', 'offer', 'rejected'].map((s) => hasApplied(s as Application['status']))).toEqual([false, true, true, true, true]);
  });

  it('recordFill keeps the status of an application already sent', () => {
    const applied = recordApplied([], job('https://acme.com/j'), [], T1, ids);
    const refilled = recordFill(applied.applications, job('https://acme.com/j'), [{ label: 'Why us?', value: 'Because' }], T2, ids);
    expect(refilled.application.status).toBe('applied');
    expect(refilled.application.statusHistory).toEqual([{ status: 'applied', at: T1 }]);
  });

  it('recordApplied replaces the answers with the final snapshot', () => {
    const filled = recordFill([], job('https://acme.com/j'), [{ label: 'Old', value: 'x' }], T1, ids);
    const applied = recordApplied(filled.applications, job('https://acme.com/j'), [{ label: 'Final', value: 'y' }], T2, ids);
    expect(applied.application).toMatchObject({ status: 'applied', answers: [{ label: 'Final', value: 'y' }] });
    expect(applied.application.statusHistory).toEqual([
      { status: 'filled', at: T1 },
      { status: 'applied', at: T2 },
    ]);
  });

  it('patchApplication edits notes, company, role and status', () => {
    const app = patchApplication(base(), { notes: 'Call on Monday\r\nwith Jane', company: '  Acme  Corp ', role: 'Lead', status: 'offer' }, T2);
    expect(app).toMatchObject({ notes: 'Call on Monday\nwith Jane', company: 'Acme Corp', role: 'Lead', status: 'offer' });
    expect(app.statusHistory.at(-1)).toEqual({ status: 'offer', at: T2 });
  });
});

describe('answers snapshot', () => {
  it('never includes consent fields or file inputs, and skips empty fields', () => {
    const answers = snapshotAnswers([
      field('text', 'First name', 'Ada'),
      field('file', 'Resume/CV', 'file'),
      field('checkbox', 'I agree to the processing of my data for recruitment purposes', 'true'),
      field('select', 'Would you like to receive updates about future openings?', 'Yes', { options: ['Yes', 'No'] }),
      field('text', 'Electronic signature (type your full name)', 'Ada Lovelace'),
      field('textarea', 'Why us?', '  Because\r\nof the mission. '),
      field('text', 'How did you hear about us?', ''),
      field('checkbox', 'Willing to travel', 'false'),
      field('checkbox', 'Open to relocation', 'true'),
      field('radio', 'Work arrangement', 'Remote', { options: ['Remote', 'Hybrid'] }),
    ]);
    expect(answers).toEqual([
      { label: 'First name', value: 'Ada' },
      { label: 'Why us?', value: 'Because\nof the mission.' },
      { label: 'Open to relocation', value: 'Yes' },
      { label: 'Work arrangement', value: 'Remote' },
    ]);
  });

  it('snapshots a real form: the Ashby fixture with its consent box ticked and resume attached', () => {
    const doc = loadFixture('ashby.html', 'https://jobs.ashbyhq.com/initech/123/application');
    (doc.getElementById('_systemfield_name') as HTMLInputElement).value = 'Ada Lovelace';
    (doc.getElementById('g7h8-portfolio') as HTMLTextAreaElement).value = 'The Analytical Engine.';
    (doc.getElementById('i9-consent') as HTMLInputElement).checked = true;
    (doc.querySelector('input[name="c3d4"][value="remote"]') as HTMLInputElement).checked = true;
    const answers = snapshotAnswers(collectFields(doc));
    expect(answers).toEqual([
      { label: 'Name', value: 'Ada Lovelace' },
      { label: 'Tell us about a project you are proud of', value: 'The Analytical Engine.' },
      { label: 'Preferred work arrangement', value: 'Remote' },
    ]);
    expect(JSON.stringify(answers)).not.toMatch(/agree|processing|resume/i);
  });

  it('keeps a repeated label once and bounds long values', () => {
    const doc = htmlDocument('<label>Email <input name="a" value="a@x.com"></label><label>Email <input name="b" value="b@x.com"></label>');
    expect(snapshotAnswers(collectFields(doc))).toEqual([{ label: 'Email', value: 'a@x.com' }]);
    const [long] = snapshotAnswers([field('textarea', 'Essay', 'x'.repeat(5000))]);
    expect(long!.value).toHaveLength(4000);
  });

  it('mergeAnswers replaces by label (case and accent insensitive) and ignores empty values', () => {
    expect(
      mergeAnswers([{ label: '¿Teléfono?', value: '1' }, { label: 'Email', value: 'a' }], [
        { label: 'telefono', value: '2' },
        { label: 'New', value: '' },
        { label: 'City', value: 'Madrid' },
      ]),
    ).toEqual([
      { label: 'telefono', value: '2' },
      { label: 'Email', value: 'a' },
      { label: 'City', value: 'Madrid' },
    ]);
  });
});

describe('listing', () => {
  const apps = [
    { ...newApplication(job('https://a.com/1', { company: 'Acme', role: 'Backend Engineer' }), 'filled', '2026-10-01T00:00:00Z', 'a'), notes: 'Referral from Jane' },
    newApplication(job('https://b.com/2', { company: 'Globex', role: 'Frontend Engineer' }), 'applied', '2026-10-04T00:00:00Z', 'b'),
    newApplication(job('https://c.com/3', { company: 'Initech', role: 'Product Designer' }), 'rejected', '2026-10-02T00:00:00Z', 'c'),
  ];

  it('sorts newest first and filters by status, date and text', () => {
    expect(filterApplications(apps).map((a) => a.id)).toEqual(['b', 'c', 'a']);
    expect(filterApplications(apps, { status: 'applied' }).map((a) => a.id)).toEqual(['b']);
    expect(filterApplications(apps, { since: '2026-10-02' }).map((a) => a.id)).toEqual(['b', 'c']);
    expect(filterApplications(apps, { query: 'engineer' }).map((a) => a.id)).toEqual(['b', 'a']);
    expect(filterApplications(apps, { query: 'jane' }).map((a) => a.id)).toEqual(['a']);
    expect(filterApplications(apps, { query: 'GLOBEX', status: 'filled' })).toEqual([]);
  });

  it('counts applications sent this week (Monday to now)', () => {
    const now = new Date(2026, 9, 7, 15, 0); // Wednesday 7 Oct 2026
    expect(startOfWeek(now)).toEqual(new Date(2026, 9, 5));
    expect(startOfWeek(new Date(2026, 9, 11, 23, 0))).toEqual(new Date(2026, 9, 5)); // Sunday
    const sent = [
      changeStatus(newApplication(job('https://a.com/1'), 'filled', new Date(2026, 9, 1).toISOString(), 'a'), 'applied', new Date(2026, 9, 6).toISOString()),
      newApplication(job('https://a.com/2'), 'applied', new Date(2026, 9, 2).toISOString(), 'b'),
      newApplication(job('https://a.com/3'), 'filled', new Date(2026, 9, 6).toISOString(), 'c'),
    ];
    expect(countAppliedSince(sent, startOfWeek(now))).toBe(1);
  });

  it('titles a record as "Role at Company" with fallbacks', () => {
    expect(applicationTitle({ role: 'Engineer', company: 'Acme', url: '' })).toBe('Engineer at Acme');
    expect(applicationTitle({ role: '', company: 'Acme', url: '' })).toBe('Acme');
    expect(applicationTitle({ role: '', company: '', url: 'https://www.acme.com/jobs/1' })).toBe('acme.com');
  });
});
