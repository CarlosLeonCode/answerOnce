import { describe, expect, it } from 'vitest';
import type { FieldDescriptor, FieldKind } from '../../src/domain/field';
import { matchBySynonyms } from '../../src/domain/synonyms';
import { normalize } from '../../src/domain/text';

function field(label: string, overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    uid: 'u1',
    kind: 'text' as FieldKind,
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

describe('normalize', () => {
  it('lowercases, strips accents, punctuation and required markers', () => {
    expect(normalize('  Teléfono Móvil *')).toBe('telefono movil');
    expect(normalize('E-mail (required)')).toBe('e mail');
    expect(normalize('¿Cuál es tu país?')).toBe('cual es tu pais');
  });
});

describe('matchBySynonyms', () => {
  it.each([
    ['First Name', 'firstName'],
    ['Last name *', 'lastName'],
    ['Full name', 'fullName'],
    ['Name', 'fullName'],
    ['Email address', 'email'],
    ['Phone number', 'phone'],
    ['LinkedIn Profile', 'linkedin'],
    ['GitHub URL', 'github'],
    ['Current company', 'currentCompany'],
    ['Job title', 'currentTitle'],
    ['Location (City)', 'location'],
    ['What are your salary expectations?', 'expectedSalary'],
    ['Will you now or in the future require sponsorship for employment visa status?', 'needsSponsorship'],
    ['Are you legally authorized to work in Spain?', 'workAuthorization'],
    ['Are you willing to relocate?', 'relocation'],
  ])('EN: %s -> %s', (label, key) => {
    expect(matchBySynonyms(field(label))?.key).toBe(key);
  });

  it.each([
    ['Nombre', 'firstName'],
    ['Apellidos', 'lastName'],
    ['Nombre completo', 'fullName'],
    ['Correo electrónico', 'email'],
    ['Teléfono', 'phone'],
    ['Número de teléfono móvil', 'phone'],
    ['Ciudad', 'city'],
    ['País de residencia', 'country'],
    ['Perfil de LinkedIn', 'linkedin'],
    ['Pretensión salarial (bruto anual)', 'expectedSalary'],
    ['¿Estás dispuesto a reubicarte en Barcelona?', 'relocation'],
    ['¿Necesitas patrocinio de visa?', 'needsSponsorship'],
    ['Periodo de preaviso', 'noticePeriod'],
    ['Disponibilidad', 'availability'],
    ['Empresa actual', 'currentCompany'],
  ])('ES: %s -> %s', (label, key) => {
    expect(matchBySynonyms(field(label))?.key).toBe(key);
  });

  it('uses name/id attributes when there is no label', () => {
    expect(matchBySynonyms(field('', { name: 'job_application[first_name]' }))?.key).toBe('firstName');
    expect(matchBySynonyms(field('', { htmlId: 'lastName' }))?.key).toBe('lastName');
  });

  it('honors autocomplete tokens', () => {
    expect(matchBySynonyms(field('Something', { autocomplete: 'section-a given-name' }))?.key).toBe('firstName');
  });

  it('maps file inputs only to documents', () => {
    expect(matchBySynonyms(field('Resume/CV', { kind: 'file' }))?.key).toBe('resume');
    expect(matchBySynonyms(field('Carta de presentación', { kind: 'file' }))?.key).toBe('coverLetter');
    expect(matchBySynonyms(field('Email', { kind: 'file' }))).toBeNull();
    expect(matchBySynonyms(field('Resume'))).toBeNull();
  });

  it('ignores fields about other people', () => {
    expect(matchBySynonyms(field('Emergency contact phone'))).toBeNull();
    expect(matchBySynonyms(field('Reference name'))).toBeNull();
    expect(matchBySynonyms(field('Nombre del contacto de emergencia'))).toBeNull();
  });

  it('does not map long open-ended questions to plain keys', () => {
    expect(matchBySynonyms(field('Why do you want to work at our company and what would you bring to the team?'))).toBeNull();
    expect(matchBySynonyms(field('Tell us about a project you are proud of'))).toBeNull();
  });
});

describe('open questions', () => {
  it('ignores the id/name of a labelled open question', () => {
    const f = field('Tell us about a project you are proud of', { kind: 'textarea', name: 'g7h8-portfolio', htmlId: 'g7h8-portfolio' });
    expect(matchBySynonyms(f)).toBeNull();
  });

  it('still uses the id when a short field has no label', () => {
    const f = field('', { kind: 'url', name: 'portfolio_url' });
    expect(matchBySynonyms(f)?.key).toBe('portfolio');
  });
});
