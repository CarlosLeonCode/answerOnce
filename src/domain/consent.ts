import type { FieldDescriptor } from './field';
import { normalize } from './text';

/**
 * Consent, legal and opt-in fields: terms, privacy policies, data processing,
 * attestations ("I certify..."), background-check authorizations, marketing
 * opt-ins and e-signatures. AnswerOnce never fills these; they are always left to
 * the user. Patterns run on normalized text (lowercase, no accents).
 */
const CONSENT_PATTERNS: RegExp[] = [
  // English
  /\bi (have read and )?(agree|accept|consent|acknowledge|certify|attest|confirm|understand|declare)\b/,
  /\b(agree|consent) to\b/,
  /\bconsent\b/,
  /\bterms (and|&) conditions\b/,
  /\bterms of (service|use)\b/,
  /\baccept (the )?terms\b/,
  /\bprivacy (policy|notice|statement)\b/,
  /\bgdpr\b/,
  /\bprocessing of (my|your) (personal )?data\b/,
  /\b(personal )?data (processing|protection|retention)\b/,
  /\bby (checking|clicking|submitting|ticking)\b/,
  /\bi (hereby )?authori[sz]e\b/,
  /\bbackground (check|screening)\b/,
  /\b(true|accurate) (and|&) (complete|correct)\b/,
  /\b(newsletter|marketing|talent (community|pool)|job alerts?)\b/,
  /\b(receive|send me) (updates|communications|emails|news)\b/,
  /\bkeep me (informed|updated)\b/,
  /\b(e ?signature|electronic signature|signature)\b/,
  // Spanish
  /\b(acepto|consiento|autorizo|declaro|certifico|confirmo que|he leido)\b/,
  /\b(aceptas|consientes|autorizas|declaras|certificas|confirmas que|has leido)\b/,
  /\bconsentimiento\b/,
  /\bterminos (y|e) condiciones\b/,
  /\bpolitica de (privacidad|proteccion de datos|cookies)\b/,
  /\baviso de privacidad\b/,
  /\btratamiento de (mis |sus |tus |los )?datos\b/,
  /\bproteccion de datos\b/,
  /\bfirma( electronica)?\b/,
];

/** Kinds where a "value" means agreeing to something. */
const CONSENT_KINDS = new Set<FieldDescriptor['kind']>(['checkbox', 'radio', 'select', 'combobox']);

/** True when the text reads like a consent / legal / opt-in statement. */
export function isConsentText(text: string): boolean {
  const n = normalize(text);
  return n !== '' && CONSENT_PATTERNS.some((p) => p.test(n));
}

/** True for fields AnswerOnce must never fill. */
export function isConsentField(field: FieldDescriptor): boolean {
  const text = [field.label, field.ariaLabel, field.placeholder, field.name.replace(/[_\-[\].]+/g, ' ')].join(' ');
  if (!isConsentText(text)) return false;
  if (CONSENT_KINDS.has(field.kind)) return true;
  // Free-text fields only when they ask for a signature ("Type your full name to sign").
  return /\b(signature|sign|firma|firmar)\b/.test(normalize(text));
}
