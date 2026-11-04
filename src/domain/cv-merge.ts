import type { CvExtraction, ExtractedEducation, ExtractedExperience } from './cv-extraction';
import { upsertAnswer } from './answer-memory';
import { newId, WORK_MODES, type Education, type Experience, type Profile, type ProfileChanges, type WorkMode } from './profile';
import { normalize } from './text';

/**
 * Merge of incoming profile changes (extracted from a CV, or proposed by an AI
 * agent) into an existing profile. Pure and deterministic: the review screen
 * builds a plan, the user adjusts decisions, applyMerge() produces the profile
 * to save.
 */

export type MergeMode = 'fill-empty' | 'overwrite';

export const SCALAR_FIELDS = [
  { key: 'firstName', section: 'Personal', label: 'First name' },
  { key: 'lastName', section: 'Personal', label: 'Last name' },
  { key: 'preferredName', section: 'Personal', label: 'Preferred name' },
  { key: 'email', section: 'Personal', label: 'Email' },
  { key: 'phone', section: 'Personal', label: 'Phone' },
  { key: 'location', section: 'Personal', label: 'Location' },
  { key: 'city', section: 'Personal', label: 'City' },
  { key: 'country', section: 'Personal', label: 'Country' },
  { key: 'pronouns', section: 'Personal', label: 'Pronouns' },
  { key: 'linkedin', section: 'Links', label: 'LinkedIn' },
  { key: 'github', section: 'Links', label: 'GitHub' },
  { key: 'portfolio', section: 'Links', label: 'Portfolio' },
  { key: 'headline', section: 'Summary', label: 'Headline' },
  { key: 'summary', section: 'Summary', label: 'Summary', multiline: true },
  { key: 'countriesAuthorized', section: 'Work authorization', label: 'Authorized to work in' },
  { key: 'needsSponsorship', section: 'Work authorization', label: 'Needs visa sponsorship' },
  { key: 'noticePeriod', section: 'Work authorization', label: 'Notice period' },
  { key: 'availability', section: 'Work authorization', label: 'Availability' },
  { key: 'expectedSalary', section: 'Preferences', label: 'Expected salary' },
  { key: 'salaryCurrency', section: 'Preferences', label: 'Salary currency' },
  { key: 'workModes', section: 'Preferences', label: 'Work modes' },
  { key: 'willingToRelocate', section: 'Preferences', label: 'Willing to relocate' },
] as const satisfies readonly { key: string; section: string; label: string; multiline?: boolean }[];

export type ScalarKey = (typeof SCALAR_FIELDS)[number]['key'];

export interface ScalarMergeField {
  key: ScalarKey;
  section: string;
  label: string;
  multiline: boolean;
  current: string;
  incoming: string;
}

export interface ListMergeItem<T> {
  /** Stable id for decisions (and for the new record if it is added). */
  id: string;
  item: T;
  /** Id of the existing record this one seems to describe (or explicitly updates), if any. */
  duplicateOf: string | null;
  /** Explicit update of an existing record by id: exactly these fields are replaced, in any mode. */
  patch?: Partial<T>;
}

export type RemovalKind = 'experience' | 'education' | 'skill' | 'answer';

export interface RemovalItem {
  /** Decision key, unique across kinds. */
  key: string;
  kind: RemovalKind;
  /** Record id (skill name for skills). */
  id: string;
  label: string;
}

export interface AnswerMergeItem {
  /** Id of the existing answer it replaces, or of the new one. */
  id: string;
  label: string;
  answer: string;
  /** Current answer for the same question, '' when it is new. */
  current: string;
}

export interface MergePlan {
  fields: ScalarMergeField[];
  experience: ListMergeItem<ExtractedExperience>[];
  education: ListMergeItem<ExtractedEducation>[];
  /** Incoming skills not yet in the profile. */
  skills: string[];
  answers: AnswerMergeItem[];
  removals: RemovalItem[];
}

export interface MergeDecisions {
  mode: MergeMode;
  fields: Partial<Record<ScalarKey, { accept: boolean; value: string }>>;
  experience: Record<string, boolean>;
  education: Record<string, boolean>;
  skills: Record<string, boolean>;
  answers: Record<string, boolean>;
  removals: Record<string, boolean>;
}

const yesNo = (v: boolean | null | undefined) => (v === null || v === undefined ? '' : v ? 'Yes' : 'No');

function currentValue(profile: Profile, key: ScalarKey): string {
  switch (key) {
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return profile.links[key];
    case 'headline':
    case 'summary':
      return profile[key];
    case 'countriesAuthorized':
      return profile.workAuthorization.countriesAuthorized.join(', ');
    case 'needsSponsorship':
      return yesNo(profile.workAuthorization.needsSponsorship);
    case 'noticePeriod':
    case 'availability':
      return profile.workAuthorization[key];
    case 'expectedSalary':
    case 'salaryCurrency':
      return profile.preferences[key];
    case 'workModes':
      return profile.preferences.workModes.join(', ');
    case 'willingToRelocate':
      return yesNo(profile.preferences.willingToRelocate);
    default:
      return profile.personal[key];
  }
}

function incomingValue(changes: ProfileChanges, key: ScalarKey): string {
  switch (key) {
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return changes.links?.[key] ?? '';
    case 'headline':
    case 'summary':
      return changes[key] ?? '';
    case 'countriesAuthorized':
      return (changes.workAuthorization?.countriesAuthorized ?? []).join(', ');
    case 'needsSponsorship':
      return yesNo(changes.workAuthorization?.needsSponsorship);
    case 'noticePeriod':
    case 'availability':
      return changes.workAuthorization?.[key] ?? '';
    case 'expectedSalary':
    case 'salaryCurrency':
      return changes.preferences?.[key] ?? '';
    case 'workModes':
      return (changes.preferences?.workModes ?? []).join(', ');
    case 'willingToRelocate':
      return yesNo(changes.preferences?.willingToRelocate);
    default:
      return changes.personal?.[key] ?? '';
  }
}

/** The changes a CV extraction suggests, in the shape agents use too. */
export function changesFromExtraction(extraction: CvExtraction): ProfileChanges {
  return {
    personal: { ...extraction.personal },
    links: { ...extraction.links },
    headline: extraction.headline,
    summary: extraction.summary,
    skills: { add: extraction.skills },
    workAuthorization: { ...extraction.workAuthorization },
    experience: { add: extraction.experience },
    education: { add: extraction.education },
  };
}

const same = (a: string, b: string) => normalize(a) === normalize(b);

function isSameExperience(a: { company: string; title: string }, b: { company: string; title: string }): boolean {
  return Boolean(a.company) && same(a.company, b.company) && (same(a.title, b.title) || !a.title || !b.title);
}

function isSameEducation(a: { school: string; degree: string }, b: { school: string; degree: string }): boolean {
  return Boolean(a.school) && same(a.school, b.school) && (same(a.degree, b.degree) || !a.degree || !b.degree);
}

function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Explicit updates (by id) that would actually change the existing record. */
function updateItems<T extends object, R extends T & { id: string }>(
  existing: readonly R[],
  updates: readonly (Partial<T> & { id: string })[] | undefined,
): ListMergeItem<T>[] {
  const out: ListMergeItem<T>[] = [];
  for (const { id, ...rest } of updates ?? []) {
    const record = existing.find((r) => r.id === id);
    if (!record) continue;
    const patch = definedOnly(rest as unknown as Partial<T>);
    const changed = Object.entries(patch).some(([k, v]) => (record as Record<string, unknown>)[k] !== v);
    if (!changed) continue;
    const { id: _id, ...fields } = record;
    out.push({ id, item: { ...(fields as unknown as T), ...patch }, duplicateOf: id, patch });
  }
  return out;
}

const roleLabel = (e: { title: string; company: string }) => [e.title, e.company].filter(Boolean).join(' · ') || 'Untitled role';
const schoolLabel = (e: { school: string; degree: string }) => [e.degree, e.school].filter(Boolean).join(' · ') || 'Untitled school';

/** Builds the review plan for a set of changes. Unchanged values are left out. */
export function buildChangePlan(profile: Profile, changes: ProfileChanges, makeId: () => string = newId): MergePlan {
  const fields: ScalarMergeField[] = [];
  for (const def of SCALAR_FIELDS) {
    const incoming = incomingValue(changes, def.key).trim();
    const current = currentValue(profile, def.key);
    if (!incoming || same(incoming, current)) continue;
    fields.push({ key: def.key, section: def.section, label: def.label, multiline: 'multiline' in def && def.multiline, current, incoming });
  }

  const known = new Set(profile.skills.map(normalize));
  const skills = (changes.skills?.add ?? []).filter((s) => {
    const n = normalize(s);
    if (!n || known.has(n)) return false;
    known.add(n);
    return true;
  });

  const answers: AnswerMergeItem[] = [];
  for (const { label, answer } of changes.savedAnswers?.upsert ?? []) {
    if (!label.trim() || !answer.trim()) continue;
    const existing = profile.savedAnswers.find((a) => normalize(a.label) === normalize(label));
    if (existing && existing.answer.trim() === answer.trim()) continue;
    answers.push({ id: existing?.id ?? makeId(), label: label.trim(), answer: answer.trim(), current: existing?.answer ?? '' });
  }

  const removals: RemovalItem[] = [];
  for (const id of new Set(changes.experience?.remove ?? [])) {
    const e = profile.experience.find((x) => x.id === id);
    if (e) removals.push({ key: `experience:${id}`, kind: 'experience', id, label: roleLabel(e) });
  }
  for (const id of new Set(changes.education?.remove ?? [])) {
    const e = profile.education.find((x) => x.id === id);
    if (e) removals.push({ key: `education:${id}`, kind: 'education', id, label: schoolLabel(e) });
  }
  for (const name of changes.skills?.remove ?? []) {
    const skill = profile.skills.find((s) => same(s, name));
    if (skill && !removals.some((r) => r.kind === 'skill' && r.id === skill)) removals.push({ key: `skill:${skill}`, kind: 'skill', id: skill, label: skill });
  }
  for (const id of new Set(changes.savedAnswers?.remove ?? [])) {
    const a = profile.savedAnswers.find((x) => x.id === id);
    if (a) removals.push({ key: `answer:${id}`, kind: 'answer', id, label: a.label });
  }
  const removed = new Set(removals.map((r) => r.id));

  return {
    fields,
    experience: [
      ...updateItems<ExtractedExperience, Experience>(profile.experience, changes.experience?.update).filter((u) => !removed.has(u.id)),
      ...(changes.experience?.add ?? []).map((item) => ({
        id: makeId(),
        item,
        duplicateOf: profile.experience.find((e) => isSameExperience(e, item))?.id ?? null,
      })),
    ],
    education: [
      ...updateItems<ExtractedEducation, Education>(profile.education, changes.education?.update).filter((u) => !removed.has(u.id)),
      ...(changes.education?.add ?? []).map((item) => ({
        id: makeId(),
        item,
        duplicateOf: profile.education.find((e) => isSameEducation(e, item))?.id ?? null,
      })),
    ],
    skills,
    answers,
    removals,
  };
}

/** Review plan for data extracted from a CV. */
export function buildMergePlan(profile: Profile, extraction: CvExtraction, makeId: () => string = newId): MergePlan {
  return buildChangePlan(profile, changesFromExtraction(extraction), makeId);
}

/**
 * Default choices. "fill-empty" accepts a field only when the profile value is
 * empty; "overwrite" accepts every incoming value. List items are always
 * accepted: new ones are added, duplicates are merged into the existing record
 * (filling its empty parts, or replacing them in overwrite mode), explicit
 * updates replace the fields they name. Saved answers and removals are accepted.
 */
export function defaultDecisions(plan: MergePlan, mode: MergeMode): MergeDecisions {
  const fields: MergeDecisions['fields'] = {};
  for (const f of plan.fields) fields[f.key] = { accept: mode === 'overwrite' || !f.current.trim(), value: f.incoming };
  return { mode, fields, ...listDecisions(plan, true) };
}

function listDecisions(plan: MergePlan, accept: boolean): Omit<MergeDecisions, 'mode' | 'fields'> {
  return {
    experience: Object.fromEntries(plan.experience.map((e) => [e.id, accept])),
    education: Object.fromEntries(plan.education.map((e) => [e.id, accept])),
    skills: Object.fromEntries(plan.skills.map((s) => [s, accept])),
    answers: Object.fromEntries(plan.answers.map((a) => [a.id, accept])),
    removals: Object.fromEntries(plan.removals.map((r) => [r.key, accept])),
  };
}

/** Sets every decision to `accept` (keeps edited values). */
export function setAllDecisions(plan: MergePlan, decisions: MergeDecisions, accept: boolean): MergeDecisions {
  const fields: MergeDecisions['fields'] = {};
  for (const f of plan.fields) fields[f.key] = { value: decisions.fields[f.key]?.value ?? f.incoming, accept };
  return { mode: decisions.mode, fields, ...listDecisions(plan, accept) };
}

function mergeRecord<T extends object>(existing: T, incoming: Partial<T>, mode: MergeMode): T {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming) as [keyof T, T[keyof T]][]) {
    if (v === '' || v === undefined || v === null) continue;
    const current = out[k];
    const empty = current === '' || current === undefined || current === null || current === false;
    if (mode === 'overwrite' || empty) out[k] = v;
  }
  return out;
}

const sortKey = (e: Experience) => (e.current ? '9999' : e.endDate || e.startDate || '');

const toFlag = (value: string): boolean | null =>
  /^(yes|true|si|sí)$/i.test(value.trim()) ? true : /^(no|false)$/i.test(value.trim()) ? false : null;

const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

function setScalar(profile: Profile, key: ScalarKey, value: string): Profile {
  switch (key) {
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return { ...profile, links: { ...profile.links, [key]: value } };
    case 'headline':
    case 'summary':
      return { ...profile, [key]: value };
    case 'countriesAuthorized':
      return { ...profile, workAuthorization: { ...profile.workAuthorization, countriesAuthorized: splitList(value) } };
    case 'needsSponsorship':
      return { ...profile, workAuthorization: { ...profile.workAuthorization, needsSponsorship: toFlag(value) } };
    case 'noticePeriod':
    case 'availability':
      return { ...profile, workAuthorization: { ...profile.workAuthorization, [key]: value } };
    case 'expectedSalary':
    case 'salaryCurrency':
      return { ...profile, preferences: { ...profile.preferences, [key]: value } };
    case 'workModes': {
      const modes = splitList(value.toLowerCase()).filter((m): m is WorkMode => (WORK_MODES as readonly string[]).includes(m));
      return { ...profile, preferences: { ...profile.preferences, workModes: [...new Set(modes)] } };
    }
    case 'willingToRelocate':
      return { ...profile, preferences: { ...profile.preferences, willingToRelocate: toFlag(value) } };
    default:
      return { ...profile, personal: { ...profile.personal, [key]: value } };
  }
}

function applyPatch<R extends { id: string }>(record: R, patch: object): R {
  const out = { ...record, ...definedOnly(patch), id: record.id } as R & { current?: boolean; endDate?: string };
  if (out.current === true && 'endDate' in out) out.endDate = '';
  return out;
}

export function applyMerge(profile: Profile, plan: MergePlan, decisions: MergeDecisions, now: string = new Date().toISOString()): Profile {
  let out: Profile = structuredClone(profile);

  for (const field of plan.fields) {
    const d = decisions.fields[field.key];
    if (d?.accept && d.value.trim()) out = setScalar(out, field.key, d.value.trim());
  }

  let addedExperience = false;
  let experience = [...out.experience];
  for (const { id, item, duplicateOf, patch } of plan.experience) {
    if (!decisions.experience[id]) continue;
    const index = duplicateOf ? experience.findIndex((e) => e.id === duplicateOf) : -1;
    if (patch) {
      if (index >= 0) experience[index] = applyPatch(experience[index]!, patch);
    } else if (index >= 0) experience[index] = mergeRecord(experience[index]!, item, decisions.mode);
    else {
      experience.push({ id, ...item });
      addedExperience = true;
    }
  }
  if (addedExperience) experience = experience.map((e, i) => [e, i] as const).sort(([a, ai], [b, bi]) => sortKey(b).localeCompare(sortKey(a)) || ai - bi).map(([e]) => e);

  let education: Education[] = [...out.education];
  for (const { id, item, duplicateOf, patch } of plan.education) {
    if (!decisions.education[id]) continue;
    const index = duplicateOf ? education.findIndex((e) => e.id === duplicateOf) : -1;
    if (patch) {
      if (index >= 0) education[index] = applyPatch(education[index]!, patch);
    } else if (index >= 0) education[index] = mergeRecord(education[index]!, item, decisions.mode);
    else education.push({ id, ...item });
  }

  let skills = [...out.skills, ...plan.skills.filter((s) => decisions.skills[s])];

  let savedAnswers = out.savedAnswers;
  for (const a of plan.answers) {
    if (decisions.answers[a.id]) savedAnswers = upsertAnswer(savedAnswers, a.label, a.answer, a.id, now);
  }

  const removed = (kind: RemovalKind) => new Set(plan.removals.filter((r) => r.kind === kind && decisions.removals[r.key]).map((r) => r.id));
  const removedExperience = removed('experience');
  const removedEducation = removed('education');
  const removedSkills = removed('skill');
  const removedAnswers = removed('answer');
  experience = experience.filter((e) => !removedExperience.has(e.id));
  education = education.filter((e) => !removedEducation.has(e.id));
  skills = skills.filter((s) => !removedSkills.has(s));
  savedAnswers = savedAnswers.filter((a) => !removedAnswers.has(a.id));

  return { ...out, experience, education, skills, savedAnswers };
}

/** Number of changes the decisions would apply (for the save button label). */
export function countAccepted(plan: MergePlan, decisions: MergeDecisions): number {
  return (
    plan.fields.filter((f) => decisions.fields[f.key]?.accept && decisions.fields[f.key]?.value.trim()).length +
    plan.experience.filter((e) => decisions.experience[e.id]).length +
    plan.education.filter((e) => decisions.education[e.id]).length +
    plan.skills.filter((s) => decisions.skills[s]).length +
    plan.answers.filter((a) => decisions.answers[a.id]).length +
    plan.removals.filter((r) => decisions.removals[r.key]).length
  );
}

/** Total number of reviewable changes in a plan. */
export function planSize(plan: MergePlan): number {
  return plan.fields.length + plan.experience.length + plan.education.length + plan.skills.length + plan.answers.length + plan.removals.length;
}
