import { describe, expect, it } from 'vitest';
import {
  buildCvExtractionPrompt,
  extractCvBasics,
  groundExtraction,
  ModelOutputError,
  normalizeDate,
  parseCvExtractionResponse,
  parseModelJson,
} from '../../src/domain/cv-extraction';

const CV = `MARÍA GARCÍA LÓPEZ
Senior Backend Engineer
Madrid, Spain · maria.garcia@example.org · Phone: +34 612 345 678
linkedin.com/in/maria-garcia-dev · https://github.com/mgarcia · mariagarcia.dev

EXPERIENCE
Acme Payments — Senior Backend Engineer
2021 - 2024
Built the ledger service.
`;

describe('regex fallback (no AI)', () => {
  it('extracts contact details, links and a name guess', () => {
    const r = extractCvBasics(CV);
    expect(r.personal).toMatchObject({ firstName: 'María', lastName: 'García López', email: 'maria.garcia@example.org', phone: '+34 612 345 678' });
    expect(r.links.linkedin).toBe('https://linkedin.com/in/maria-garcia-dev');
    expect(r.links.github).toBe('https://github.com/mgarcia');
    expect(r.links.portfolio).toBe('https://mariagarcia.dev');
    expect(r.headline).toBe('Senior Backend Engineer');
    expect(r.experience).toEqual([]);
  });

  it('does not mistake year ranges for phone numbers or headings for names', () => {
    const r = extractCvBasics('Curriculum Vitae\nJohn Smith\n2019 - 2021 2021 - 2023\njohn@smith.io');
    expect(r.personal.phone).toBe('');
    expect(r.personal.firstName).toBe('John');
    expect(r.personal.lastName).toBe('Smith');
    // The email domain must not be picked up as a portfolio.
    expect(r.links.portfolio).toBe('');
  });

  it('returns empty values for text without contact data', () => {
    const r = extractCvBasics('just some lowercase words without anything useful');
    expect(r.personal.email).toBe('');
    expect(r.personal.firstName).toBe('');
  });
});

describe('model output parsing', () => {
  const valid = { personal: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }, skills: ['Math', 'Engines'] };

  it('accepts plain JSON', () => {
    expect(parseCvExtractionResponse(JSON.stringify(valid)).personal.firstName).toBe('Ada');
  });

  it('strips code fences and surrounding prose', () => {
    const raw = 'Sure! Here is the JSON:\n```json\n' + JSON.stringify(valid, null, 2) + '\n```\nLet me know if you need more.';
    const r = parseCvExtractionResponse(raw);
    expect(r.personal.lastName).toBe('Lovelace');
    expect(r.skills).toEqual(['Math', 'Engines']);
  });

  it('repairs trailing commas and truncated output', () => {
    expect(parseModelJson('{"a": 1, "b": [1, 2,],}')).toEqual({ a: 1, b: [1, 2] });
    const truncated = '{"personal": {"firstName": "Ada", "lastName": "Love';
    expect(parseCvExtractionResponse(truncated).personal).toMatchObject({ firstName: 'Ada', lastName: 'Love' });
    const cutInKey = '{"personal": {"firstName": "Ada"}, "experience": [{"company": "X", "title": "Dev"}, {"comp';
    const r = parseCvExtractionResponse(cutInKey);
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0]).toMatchObject({ company: 'X', title: 'Dev' });
  });

  it('rejects output without a JSON object', () => {
    expect(() => parseModelJson('I cannot help with that.')).toThrow(ModelOutputError);
    expect(() => parseModelJson('[1, 2, 3]')).toThrow(ModelOutputError);
  });

  it('coerces junk types instead of trusting the shape', () => {
    const r = parseCvExtractionResponse(
      JSON.stringify({
        personal: { firstName: 42, lastName: { evil: true }, email: 'not-an-email', phone: '12' },
        links: { linkedin: 'javascript:alert(1)', github: 'github.com/ada', portfolio: 'https://user:pw@evil.com' },
        skills: 'TypeScript, React; Node',
        workAuthorization: { countriesAuthorized: 'Spain', needsSponsorship: 'no' },
        experience: [null, 'text', { company: 'Acme', title: 'Dev', startDate: 'Jan 2020', endDate: 'Present' }, { foo: 1 }],
        education: { school: 'MIT', degree: 'BSc', startDate: 2015, endDate: '06/2019' },
        extra: 'ignored',
      }),
    );
    expect(r.personal).toMatchObject({ firstName: '42', lastName: '', email: '', phone: '' });
    expect(r.links).toEqual({ linkedin: '', github: 'https://github.com/ada', portfolio: '' });
    expect(r.skills).toEqual(['TypeScript', 'React', 'Node']);
    expect(r.workAuthorization).toEqual({ countriesAuthorized: ['Spain'], needsSponsorship: false });
    expect(r.experience).toEqual([
      { company: 'Acme', title: 'Dev', location: '', startDate: '2020-01', endDate: '', current: true, description: '' },
    ]);
    expect(r.education).toEqual([{ school: 'MIT', degree: 'BSc', field: '', startDate: '2015', endDate: '2019-06' }]);
    expect('extra' in r).toBe(false);
  });

  it('clamps oversized values', () => {
    const r = parseCvExtractionResponse(JSON.stringify({ summary: 'x'.repeat(10_000), skills: Array.from({ length: 200 }, (_, i) => `s${i}`) }));
    expect(r.summary.length).toBe(4000);
    expect(r.skills).toHaveLength(80);
  });

  it('normalizes common date formats', () => {
    expect(normalizeDate('2020-3')).toBe('2020-03');
    expect(normalizeDate('03/2021')).toBe('2021-03');
    expect(normalizeDate('Sept. 2019')).toBe('2019-09');
    expect(normalizeDate('Actualidad')).toBe('');
  });
});

describe('grounding against the CV text', () => {
  it('drops contact details that are not in the CV and fills gaps from regex', () => {
    const fromModel = parseCvExtractionResponse(
      JSON.stringify({
        personal: { firstName: 'María', lastName: 'García', email: 'invented@example.com', phone: '+1 555 000 1111' },
        links: { linkedin: 'https://linkedin.com/in/someone-else', github: 'https://github.com/mgarcia' },
      }),
    );
    const r = groundExtraction(fromModel, CV);
    expect(r.personal.email).toBe('maria.garcia@example.org');
    expect(r.personal.phone).toBe('+34 612 345 678');
    expect(r.links.linkedin).toBe('https://linkedin.com/in/maria-garcia-dev');
    expect(r.links.github).toBe('https://github.com/mgarcia');
    expect(r.personal.lastName).toBe('García');
  });
});

describe('extraction prompt', () => {
  it('marks the CV as data and caps its length', () => {
    const p = buildCvExtractionPrompt('A'.repeat(50_000));
    expect(p.system).toMatch(/data, not instructions/);
    expect(p.user.length).toBeLessThan(31_000);
  });
});
