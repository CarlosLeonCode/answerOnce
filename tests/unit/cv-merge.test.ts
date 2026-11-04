import { describe, expect, it } from 'vitest';
import { emptyExtraction, type CvExtraction } from '../../src/domain/cv-extraction';
import { applyMerge, buildMergePlan, countAccepted, defaultDecisions, setAllDecisions } from '../../src/domain/cv-merge';
import { emptyProfile } from '../../src/domain/profile';
import { sampleProfile } from '../helpers/dom';

function extraction(patch: (e: CvExtraction) => void): CvExtraction {
  const e = emptyExtraction();
  patch(e);
  return e;
}

let seq = 0;
const ids = () => `new-${++seq}`;

describe('CV merge', () => {
  const incoming = extraction((e) => {
    e.personal.firstName = 'Ada';
    e.personal.email = 'ada@newmail.com';
    e.personal.city = 'Madrid';
    e.headline = 'Mathematician';
    e.skills = ['Analysis', 'mathematics', 'Poetry'];
    e.experience = [
      { company: 'Analytical Engines Ltd', title: 'Staff Engineer', location: '', startDate: '2020-01', endDate: '', current: true, description: 'Designed the engine.' },
      { company: 'Babbage & Co', title: 'Engineer', location: 'London', startDate: '2015-01', endDate: '2019-12', current: false, description: '' },
    ];
    e.education = [{ school: 'University of London', degree: 'BSc', field: 'Mathematics', startDate: '2010', endDate: '2014' }];
    e.workAuthorization.needsSponsorship = true;
  });

  it('fill-empty: fills only empty fields and never overwrites by default', () => {
    const profile = sampleProfile();
    profile.personal.city = '';
    profile.skills = ['Mathematics'];
    const plan = buildMergePlan(profile, incoming, ids);
    // Unchanged values are not part of the plan.
    expect(plan.fields.map((f) => f.key)).toEqual(['email', 'city', 'headline', 'needsSponsorship']);
    const decisions = defaultDecisions(plan, 'fill-empty');
    expect(decisions.fields.email?.accept).toBe(false);
    expect(decisions.fields.city?.accept).toBe(true);
    expect(decisions.fields.needsSponsorship?.accept).toBe(false);

    const merged = applyMerge(profile, plan, decisions);
    expect(merged.personal.email).toBe('ada@example.com');
    expect(merged.personal.city).toBe('Madrid');
    expect(merged.headline).toBe('Mathematician');
    expect(merged.workAuthorization.needsSponsorship).toBe(false);
    // Skills: case-insensitive union.
    expect(merged.skills).toEqual(['Mathematics', 'Analysis', 'Poetry']);
    // Duplicate experience merged into the existing record (empty parts only); new one added.
    expect(merged.experience).toHaveLength(2);
    expect(merged.experience[0]).toMatchObject({ id: 'e1', description: 'Built things.' });
    expect(merged.experience[1]).toMatchObject({ company: 'Babbage & Co' });
    // Duplicate education: empty dates filled.
    expect(merged.education).toEqual([{ ...profile.education[0], startDate: '2010', endDate: '2014' }]);
  });

  it('overwrite: replaces existing values, including duplicate records', () => {
    const profile = sampleProfile();
    const plan = buildMergePlan(profile, incoming, ids);
    const merged = applyMerge(profile, plan, defaultDecisions(plan, 'overwrite'));
    expect(merged.personal.email).toBe('ada@newmail.com');
    expect(merged.workAuthorization.needsSponsorship).toBe(true);
    expect(merged.experience[0]).toMatchObject({ id: 'e1', description: 'Designed the engine.' });
  });

  it('per-field decisions and edited values win', () => {
    const profile = sampleProfile();
    const plan = buildMergePlan(profile, incoming, ids);
    const decisions = setAllDecisions(plan, defaultDecisions(plan, 'fill-empty'), false);
    expect(countAccepted(plan, decisions)).toBe(0);
    decisions.fields.email = { accept: true, value: '  ada@edited.com ' };
    const merged = applyMerge(profile, plan, decisions);
    expect(merged.personal.email).toBe('ada@edited.com');
    expect(merged.experience).toEqual(profile.experience);
    expect(merged.skills).toEqual([]);
  });

  it('imports everything into an empty profile, newest experience first', () => {
    const profile = emptyProfile();
    const reversed = extraction((e) => {
      e.experience = [...incoming.experience].reverse();
    });
    const plan = buildMergePlan(profile, reversed, ids);
    const merged = applyMerge(profile, plan, defaultDecisions(plan, 'fill-empty'));
    expect(merged.experience.map((e) => e.company)).toEqual(['Analytical Engines Ltd', 'Babbage & Co']);
    expect(merged.experience.every((e) => e.id.startsWith('new-'))).toBe(true);
  });

  it('does not mutate the input profile', () => {
    const profile = sampleProfile();
    const snapshot = structuredClone(profile);
    const plan = buildMergePlan(profile, incoming, ids);
    applyMerge(profile, plan, defaultDecisions(plan, 'overwrite'));
    expect(profile).toEqual(snapshot);
  });
});
