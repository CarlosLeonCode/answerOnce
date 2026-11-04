import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { emptyProfile, type Profile } from '../../src/domain/profile';

export function loadFixture(name: string, url: string): Document {
  const html = readFileSync(resolve(__dirname, '../fixtures', name), 'utf8');
  return new JSDOM(html, { url, pretendToBeVisual: true }).window.document;
}

export function htmlDocument(body: string, url = 'https://example.com/apply'): Document {
  return new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url, pretendToBeVisual: true }).window.document;
}

export function sampleProfile(): Profile {
  const p = emptyProfile();
  p.personal = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    preferredName: '',
    email: 'ada@example.com',
    phone: '+34 600 111 222',
    location: 'Madrid, Spain',
    city: 'Madrid',
    country: 'Spain',
    pronouns: 'she/her',
  };
  p.links = { linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada', portfolio: 'https://ada.dev', other: [] };
  p.workAuthorization = { countriesAuthorized: ['Spain', 'European Union'], needsSponsorship: false, noticePeriod: '30 days', availability: 'Immediately' };
  p.preferences = { expectedSalary: '70000', salaryCurrency: 'EUR', workModes: ['remote', 'hybrid'], willingToRelocate: true };
  p.experience = [
    { id: 'e1', company: 'Analytical Engines Ltd', title: 'Staff Engineer', location: 'London', startDate: '2020-01', endDate: '', current: true, description: 'Built things.' },
  ];
  p.education = [{ id: 'ed1', school: 'University of London', degree: 'BSc', field: 'Mathematics', startDate: '', endDate: '' }];
  p.documents = [
    { id: 'doc-cv', kind: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', size: 10, storedAs: 'documents/cv-12345678.pdf', addedAt: '2026-01-01T00:00:00Z' },
  ];
  return p;
}
