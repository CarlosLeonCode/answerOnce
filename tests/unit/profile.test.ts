import { describe, expect, it } from 'vitest';
import { isProfileEmpty, profileCompleteness } from '../../src/domain/completeness';
import { emptyProfile, parseProfile, PROFILE_SCHEMA_VERSION, UnsupportedProfileVersionError, defaultResume } from '../../src/domain/profile';
import { resolveValue } from '../../src/domain/fill';
import { sampleProfile } from '../helpers/dom';

describe('profile schema migration', () => {
  it('loads a v1 vault (no headline/summary/skills/defaultResumeId) and upgrades it', () => {
    const v1 = {
      schemaVersion: 1,
      personal: { firstName: 'Ada', email: 'ada@example.com' },
      experience: [{ id: 'x', company: 'Acme' }],
      ai: { provider: 'ollama' },
    };
    const p = parseProfile(v1);
    expect(p.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(p).toMatchObject({ headline: '', summary: '', skills: [], defaultResumeId: '' });
    expect(p.personal.firstName).toBe('Ada');
    expect(p.experience[0]).toMatchObject({ company: 'Acme', title: '', current: false });
    expect(p.ai.provider).toBe('ollama');
  });

  it('treats a missing version as v1 and round-trips the current version', () => {
    expect(parseProfile({}).schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    const current = parseProfile(JSON.parse(JSON.stringify(sampleProfile())));
    expect(current).toEqual(parseProfile(current));
  });

  it('refuses vaults written by a newer version instead of dropping data', () => {
    expect(() => parseProfile({ schemaVersion: 99 })).toThrow(UnsupportedProfileVersionError);
  });
});

describe('default resume', () => {
  it('uses the chosen default CV for resume fields, else the first CV', () => {
    const p = sampleProfile();
    p.documents.push({ ...p.documents[0]!, id: 'doc-cv2', fileName: 'cv-2026.pdf' });
    expect(defaultResume(p)?.id).toBe('doc-cv');
    p.defaultResumeId = 'doc-cv2';
    expect(defaultResume(p)?.id).toBe('doc-cv2');
    const field = { kind: 'file' } as Parameters<typeof resolveValue>[2];
    expect(resolveValue(p, 'resume', field)).toEqual({ type: 'file', documentId: 'doc-cv2' });
    p.defaultResumeId = 'deleted';
    expect(defaultResume(p)?.id).toBe('doc-cv');
  });
});

describe('profile completeness', () => {
  it('is 0% for a new vault and lists what is missing', () => {
    const c = profileCompleteness(emptyProfile());
    expect(c.percent).toBe(0);
    expect(c.missing.map((m) => m.id)).toContain('resume');
    expect(isProfileEmpty(emptyProfile())).toBe(true);
  });

  it('reaches 100% for a complete profile', () => {
    const p = sampleProfile();
    p.headline = 'Engineer';
    p.skills = ['Math'];
    const c = profileCompleteness(p);
    expect(c.missing).toEqual([]);
    expect(c.percent).toBe(100);
    expect(isProfileEmpty(p)).toBe(false);
  });
});
