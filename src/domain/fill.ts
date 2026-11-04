import type { CanonicalKey } from './canonical-keys';
import type { FieldDescriptor } from './field';
import { defaultResume, fullName, type Profile, type DocumentKind } from './profile';
import { pickOption } from './choice';
import { containsPhrase, normalize } from './text';

/** A value to put into a field. Serializable. */
export type FillValue =
  | { type: 'text'; text: string }
  /** Pick the option that best matches any of the candidates (in priority order). */
  | { type: 'choice'; candidates: string[] }
  | { type: 'bool'; value: boolean }
  | { type: 'file'; documentId: string };

export type MatchSource = 'ats' | 'synonym' | 'memory' | 'manual';

export interface FieldMatch {
  field: FieldDescriptor;
  frameId: number;
  key: CanonicalKey | null;
  source: MatchSource;
  value: FillValue;
  /** Saved answer label that produced this match (source === 'memory'). */
  memoryLabel?: string;
}

/** Instruction sent to the page agent. File bytes are resolved by the application layer. */
export interface FillInstruction {
  uid: string;
  value:
    | { type: 'text'; text: string }
    | { type: 'choice'; candidates: string[] }
    | { type: 'bool'; value: boolean }
    | { type: 'file'; fileName: string; mimeType: string; base64: string };
}

export type FillStatus = 'filled' | 'skipped-nonempty' | 'skipped-consent' | 'failed' | 'not-found';

export interface FillResult {
  uid: string;
  status: FillStatus;
  detail?: string;
}

export const YES_WORDS = ['yes', 'si', 'true'];
export const NO_WORDS = ['no', 'false', 'i am not', 'i do not', 'i will not'];

function boolValue(field: FieldDescriptor, value: boolean): FillValue {
  if (field.kind === 'checkbox') return { type: 'bool', value };
  if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') {
    return { type: 'choice', candidates: value ? YES_WORDS : NO_WORDS };
  }
  return { type: 'text', text: value ? 'Yes' : 'No' };
}

function textValue(field: FieldDescriptor, text: string): FillValue | null {
  if (!text.trim()) return null;
  if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') {
    return { type: 'choice', candidates: [text] };
  }
  if (field.kind === 'checkbox' || field.kind === 'file') return null;
  return { type: 'text', text };
}

function hasYesNoOptions(field: FieldDescriptor): boolean {
  const opts = field.options.map(normalize);
  return opts.some((o) => o === 'yes' || o === 'si') && opts.some((o) => o === 'no');
}

function document(profile: Profile, kind: DocumentKind): FillValue | null {
  const doc = kind === 'cv' ? defaultResume(profile) : profile.documents.find((d) => d.kind === kind);
  return doc ? { type: 'file', documentId: doc.id } : null;
}

function workAuthorization(profile: Profile, field: FieldDescriptor): FillValue | null {
  const countries = profile.workAuthorization.countriesAuthorized.filter((c) => c.trim());
  if (countries.length === 0) return null;
  const label = normalize(field.label);
  const mentioned = countries.find((c) => containsPhrase(label, normalize(c)));
  if (field.kind === 'checkbox' || field.kind === 'radio' || hasYesNoOptions(field)) {
    // "Are you authorized to work in <country>?" -> yes only if that country (or none) is mentioned.
    const mentionsAnyCountry = /\bin (the )?[a-z]/.test(label) || /\ben [a-z]/.test(label);
    if (mentioned) return boolValue(field, true);
    if (!mentionsAnyCountry) return boolValue(field, true);
    return null; // Unknown country: leave for the user.
  }
  return textValue(field, countries.join(', '));
}

function workMode(profile: Profile, field: FieldDescriptor): FillValue | null {
  const modes = profile.preferences.workModes;
  if (modes.length === 0) return null;
  if (hasYesNoOptions(field) || field.kind === 'checkbox') {
    const label = normalize(field.label);
    const asked = (['remote', 'hybrid', 'onsite'] as const).find((m) =>
      containsPhrase(label, m) || (m === 'remote' && containsPhrase(label, 'remotely')) || (m === 'onsite' && containsPhrase(label, 'on site')),
    );
    return asked ? boolValue(field, modes.includes(asked)) : null;
  }
  const words: Record<string, string[]> = {
    remote: ['Remote', 'Remoto', 'Teletrabajo'],
    hybrid: ['Hybrid', 'Híbrido'],
    onsite: ['On-site', 'Onsite', 'In office', 'Presencial'],
  };
  if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') {
    return { type: 'choice', candidates: modes.flatMap((m) => words[m] ?? []) };
  }
  return textValue(field, modes.map((m) => words[m]?.[0] ?? m).join(', '));
}

/** Resolves the profile value for a canonical key, shaped for the given field. */
export function resolveValue(profile: Profile, key: CanonicalKey, field: FieldDescriptor): FillValue | null {
  const p = profile.personal;
  const current = profile.experience.find((e) => e.current) ?? profile.experience[0];
  const edu = profile.education[0];
  switch (key) {
    case 'fullName': return textValue(field, fullName(profile));
    case 'firstName': return textValue(field, p.firstName);
    case 'lastName': return textValue(field, p.lastName);
    case 'preferredName': return textValue(field, p.preferredName || p.firstName);
    case 'email': return textValue(field, p.email);
    case 'phone': return textValue(field, p.phone);
    case 'location': return textValue(field, p.location || [p.city, p.country].filter(Boolean).join(', '));
    case 'city': return textValue(field, p.city);
    case 'country': return textValue(field, p.country);
    case 'pronouns': return textValue(field, p.pronouns);
    case 'linkedin': return textValue(field, profile.links.linkedin);
    case 'github': return textValue(field, profile.links.github);
    case 'portfolio': return textValue(field, profile.links.portfolio);
    case 'website': return textValue(field, profile.links.portfolio || profile.links.other[0]?.url || '');
    case 'workAuthorization': return workAuthorization(profile, field);
    case 'needsSponsorship': {
      const v = profile.workAuthorization.needsSponsorship;
      return v === null ? null : boolValue(field, v);
    }
    case 'noticePeriod': return textValue(field, profile.workAuthorization.noticePeriod);
    case 'availability': return textValue(field, profile.workAuthorization.availability);
    case 'expectedSalary': {
      const { expectedSalary, salaryCurrency } = profile.preferences;
      if (field.kind === 'number') return textValue(field, expectedSalary.replace(/[^\d.]/g, ''));
      return textValue(field, [expectedSalary, salaryCurrency].filter(Boolean).join(' '));
    }
    case 'salaryCurrency': return textValue(field, profile.preferences.salaryCurrency);
    case 'workMode': return workMode(profile, field);
    case 'relocation': {
      const v = profile.preferences.willingToRelocate;
      return v === null ? null : boolValue(field, v);
    }
    case 'currentCompany': return textValue(field, current?.company ?? '');
    case 'currentTitle': return textValue(field, current?.title ?? '');
    case 'school': return textValue(field, edu?.school ?? '');
    case 'degree': return textValue(field, edu?.degree ?? '');
    case 'fieldOfStudy': return textValue(field, edu?.field ?? '');
    case 'resume': return document(profile, 'cv');
    case 'coverLetter': return document(profile, 'cover_letter');
  }
}

export { pickOption };
