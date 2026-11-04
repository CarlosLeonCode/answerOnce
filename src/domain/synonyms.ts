import type { CanonicalKey } from './canonical-keys';
import { isOpenEnded, type FieldDescriptor } from './field';
import { containsPhrase, identifierToWords, normalize } from './text';

/**
 * Synonym dictionary (EN + ES) mapping label phrases to canonical keys.
 * All phrases are written already normalized (lowercase, no accents/punctuation).
 *
 * - `phrases` match when they appear as a whole-word sequence in the label.
 * - `exact` match only when the whole label equals the phrase (for short,
 *   ambiguous words like "name" or "title").
 * - `question` keys may match long, question-like labels
 *   (e.g. "Will you now or in the future require visa sponsorship?").
 */
export interface SynonymRule {
  key: CanonicalKey;
  phrases: string[];
  exact?: string[];
  question?: boolean;
}

export const SYNONYMS: SynonymRule[] = [
  {
    key: 'fullName',
    phrases: ['full name', 'your name', 'legal name', 'full legal name', 'nombre completo', 'nombre y apellidos', 'nombre y apellido'],
    exact: ['name', 'nombre y apellidos'],
  },
  {
    key: 'firstName',
    phrases: ['first name', 'given name', 'forename', 'legal first name', 'primer nombre', 'nombre de pila'],
    exact: ['nombre', 'nombres', 'first'],
  },
  {
    key: 'lastName',
    phrases: ['last name', 'surname', 'family name', 'legal last name', 'apellido', 'apellidos', 'primer apellido'],
    exact: ['last'],
  },
  { key: 'preferredName', phrases: ['preferred name', 'preferred first name', 'nickname', 'nombre preferido'] },
  {
    key: 'email',
    phrases: ['email', 'e mail', 'email address', 'correo', 'correo electronico', 'direccion de correo'],
    exact: ['mail'],
  },
  {
    key: 'phone',
    phrases: ['phone', 'phone number', 'mobile', 'mobile phone', 'mobile number', 'telephone', 'cell phone', 'telefono', 'movil', 'celular', 'numero de telefono'],
  },
  {
    key: 'location',
    phrases: ['location', 'current location', 'where are you located', 'where are you based', 'address', 'ubicacion', 'ubicacion actual', 'direccion', 'lugar de residencia', 'location city'],
  },
  { key: 'city', phrases: ['city', 'ciudad', 'town', 'localidad'] },
  { key: 'country', phrases: ['country', 'country of residence', 'pais', 'pais de residencia'] },
  { key: 'pronouns', phrases: ['pronouns', 'pronombres', 'preferred pronouns'] },
  { key: 'linkedin', phrases: ['linkedin', 'linkedin profile', 'linkedin url', 'perfil de linkedin'] },
  { key: 'github', phrases: ['github', 'github profile', 'github url'] },
  { key: 'portfolio', phrases: ['portfolio', 'portfolio url', 'portfolio website', 'portafolio', 'portafolio url'] },
  {
    key: 'website',
    phrases: ['website', 'personal website', 'web site', 'other website', 'sitio web', 'pagina web', 'personal site', 'blog'],
    exact: ['url'],
  },
  {
    key: 'workAuthorization',
    question: true,
    phrases: [
      'authorized to work', 'authorised to work', 'legally authorized', 'legally authorised', 'work authorization',
      'work authorisation', 'eligible to work', 'right to work', 'autorizado para trabajar', 'autorizada para trabajar',
      'permiso de trabajo', 'autorizacion para trabajar', 'autorizacion de trabajo',
    ],
  },
  {
    key: 'needsSponsorship',
    question: true,
    phrases: ['sponsorship', 'visa sponsorship', 'require sponsorship', 'patrocinio', 'patrocinio de visa', 'sponsor'],
  },
  { key: 'noticePeriod', question: true, phrases: ['notice period', 'periodo de preaviso', 'preaviso', 'periodo de aviso'] },
  {
    key: 'availability',
    question: true,
    phrases: [
      'start date', 'earliest start date', 'availability', 'available to start', 'when can you start', 'disponibilidad',
      'fecha de inicio', 'fecha de incorporacion', 'cuando podrias empezar', 'cuando puedes empezar',
    ],
  },
  {
    key: 'expectedSalary',
    question: true,
    phrases: [
      'salary', 'expected salary', 'salary expectations', 'salary expectation', 'desired salary', 'expected compensation',
      'compensation expectations', 'desired compensation', 'pretension salarial', 'pretensiones salariales',
      'expectativa salarial', 'expectativas salariales', 'salario', 'salario deseado', 'remuneracion', 'sueldo',
    ],
  },
  { key: 'salaryCurrency', phrases: ['currency', 'salary currency', 'moneda', 'divisa'] },
  {
    key: 'workMode',
    question: true,
    phrases: ['work arrangement', 'work mode', 'workplace type', 'remote or hybrid', 'remote hybrid', 'modalidad', 'modalidad de trabajo', 'work remotely', 'remote work'],
  },
  {
    key: 'relocation',
    question: true,
    phrases: ['relocate', 'relocation', 'willing to relocate', 'reubicacion', 'reubicarte', 'reubicarse', 'mudarte', 'trasladarte', 'traslado'],
  },
  {
    key: 'currentCompany',
    phrases: ['current company', 'current employer', 'most recent employer', 'empresa actual', 'empleador actual'],
    exact: ['company', 'employer', 'empresa', 'organization', 'organisation'],
  },
  {
    key: 'currentTitle',
    phrases: ['current title', 'job title', 'current role', 'current position', 'cargo actual', 'puesto actual', 'titulo del puesto'],
    exact: ['title', 'role', 'position', 'cargo', 'puesto'],
  },
  { key: 'school', phrases: ['school', 'university', 'college', 'institution', 'universidad', 'institucion educativa', 'centro de estudios'] },
  { key: 'degree', phrases: ['degree', 'titulacion', 'titulo academico', 'grado academico'] },
  { key: 'fieldOfStudy', phrases: ['discipline', 'field of study', 'major', 'area de estudio', 'especialidad', 'carrera'] },
  {
    key: 'resume',
    phrases: ['resume', 'cv', 'resume cv', 'curriculum', 'curriculum vitae', 'hoja de vida', 'upload resume', 'attach resume', 'adjuntar cv'],
  },
  { key: 'coverLetter', phrases: ['cover letter', 'carta de presentacion', 'motivation letter', 'carta de motivacion'] },
];

/** Labels mentioning these refer to someone else's data; never map them to the user's profile. */
const EXCLUSIONS = [
  'emergency', 'reference', 'referee', 'referral', 'referred', 'referrer', 'recruiter', 'hiring manager',
  'emergencia', 'referencia', 'referido', 'reclutador',
];

/** Labels longer than this (in words) are treated as questions; only `question` rules apply. */
const MAX_PLAIN_LABEL_WORDS = 7;

const DOCUMENT_KEYS: ReadonlySet<CanonicalKey> = new Set(['resume', 'coverLetter']);

/** Maps HTML autocomplete tokens to canonical keys (strong signal). */
const AUTOCOMPLETE: Record<string, CanonicalKey> = {
  name: 'fullName',
  'given-name': 'firstName',
  'family-name': 'lastName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'address-level2': 'city',
  'country-name': 'country',
  country: 'country',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
};

export interface SynonymMatch {
  key: CanonicalKey;
  score: number;
}

function scoreText(text: string, rule: SynonymRule, allowLong: boolean): number {
  if (!text) return 0;
  let best = 0;
  for (const exact of rule.exact ?? []) {
    if (text === exact) best = Math.max(best, 1000 + exact.length);
  }
  const words = text.split(' ').length;
  if (words > MAX_PLAIN_LABEL_WORDS && !allowLong) return best;
  for (const phrase of rule.phrases) {
    if (text === phrase) best = Math.max(best, 1000 + phrase.length);
    else if (containsPhrase(text, phrase)) best = Math.max(best, 100 + phrase.length * 2 - words);
  }
  return best;
}

function isCompatible(key: CanonicalKey, field: FieldDescriptor): boolean {
  const isFile = field.kind === 'file';
  return DOCUMENT_KEYS.has(key) ? isFile : !isFile;
}

/** Finds the best canonical key for a field using label, then attributes. */
export function matchBySynonyms(field: FieldDescriptor): SynonymMatch | null {
  const label = normalize(field.label || field.ariaLabel || field.placeholder);
  const attrs = [identifierToWords(field.name), identifierToWords(field.htmlId)].filter(Boolean);
  const excluded = (text: string) => EXCLUSIONS.some((x) => containsPhrase(text, x));
  if (excluded(label) || attrs.some(excluded)) return null;

  const auto = field.autocomplete.trim().toLowerCase().split(/\s+/).pop() ?? '';
  const autoKey = AUTOCOMPLETE[auto];
  if (autoKey && isCompatible(autoKey, field)) return { key: autoKey, score: 2000 };

  let best: SynonymMatch | null = null;
  for (const rule of SYNONYMS) {
    if (!isCompatible(rule.key, field)) continue;
    let score = scoreText(label, rule, rule.question === true);
    // Attribute names are a weaker signal than the visible label, and are
    // ignored for labelled open questions: an id like "portfolio" on "Tell us
    // about a project" must not turn the answer into a URL.
    if (!(label && isOpenEnded(field))) {
      for (const attr of attrs) score = Math.max(score, scoreText(attr, rule, false) / 2);
    }
    if (score > 0 && (!best || score > best.score)) best = { key: rule.key, score };
  }
  return best;
}
