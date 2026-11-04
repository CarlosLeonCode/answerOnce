import { cleanText, ExtractedEducationSchema, ExtractedExperienceSchema, normalizeDate, normalizeUrl } from './cv-extraction';
import type { MergeMode } from './cv-merge';
import type { AgentProposal, Profile, ProfileChanges } from './profile';
import { normalize } from './text';

/**
 * Rules for changes proposed by AI agents (through the local answeronce-mcp server):
 * normalization of untrusted input, merging into a pending proposal, counting
 * and the scoped, read-only view of the profile an agent may request.
 */

const MAX_TEXT = 300;
const MAX_LONG_TEXT = 4000;
const MAX_SKILL = 60;
const MAX_LIST = 50;

export const PROFILE_SECTIONS = ['personal', 'links', 'about', 'workAuthorization', 'preferences', 'experience', 'education', 'savedAnswers'] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

/**
 * Only the requested sections, copied field by field. AI provider settings
 * (API key), agent settings, documents and pending proposals are never part of it.
 */
export function profileView(profile: Profile, sections: readonly ProfileSection[]): Partial<Record<ProfileSection, unknown>> {
  const view: Partial<Record<ProfileSection, unknown>> = {};
  for (const section of new Set(sections)) {
    switch (section) {
      case 'personal':
        view.personal = { ...profile.personal };
        break;
      case 'links':
        view.links = { linkedin: profile.links.linkedin, github: profile.links.github, portfolio: profile.links.portfolio, other: profile.links.other.map((l) => ({ ...l })) };
        break;
      case 'about':
        view.about = { headline: profile.headline, summary: profile.summary, skills: [...profile.skills] };
        break;
      case 'workAuthorization':
        view.workAuthorization = { ...profile.workAuthorization, countriesAuthorized: [...profile.workAuthorization.countriesAuthorized] };
        break;
      case 'preferences':
        view.preferences = { ...profile.preferences, workModes: [...profile.preferences.workModes] };
        break;
      case 'experience':
        view.experience = profile.experience.map((e) => ({ ...e }));
        break;
      case 'education':
        view.education = profile.education.map((e) => ({ ...e }));
        break;
      case 'savedAnswers':
        view.savedAnswers = profile.savedAnswers.map((a) => ({ ...a }));
        break;
    }
  }
  return view;
}

export interface NormalizedChanges {
  changes: ProfileChanges;
  /** Human readable notes about values that were dropped or rewritten. */
  warnings: string[];
}

function text(value: string | undefined, max = MAX_TEXT): string | undefined {
  return value === undefined ? undefined : cleanText(value, max);
}

function definedEntries<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

function uniqueStrings(values: readonly string[] | undefined, max: number): string[] | undefined {
  if (!values) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const clean = cleanText(v, max);
    if (clean && !seen.has(normalize(clean))) {
      seen.add(normalize(clean));
      out.push(clean);
    }
  }
  return out.slice(0, MAX_LIST);
}

/**
 * Cleans untrusted changes the same way CV extraction output is cleaned:
 * trims and clamps text, normalizes dates to YYYY-MM and links to https URLs.
 * Invalid emails and URLs are dropped with a warning.
 */
export function normalizeChanges(input: ProfileChanges): NormalizedChanges {
  const warnings: string[] = [];
  const out: ProfileChanges = {};

  if (input.personal) {
    const p = input.personal;
    let email = text(p.email, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`Ignored invalid email "${email}".`);
      email = undefined;
    }
    out.personal = definedEntries({
      firstName: text(p.firstName, 80),
      lastName: text(p.lastName, 120),
      preferredName: text(p.preferredName, 80),
      email,
      phone: text(p.phone, 40),
      location: text(p.location),
      city: text(p.city, 80),
      country: text(p.country, 80),
      pronouns: text(p.pronouns, 40),
    });
  }
  if (input.links) {
    const links: Record<string, string | undefined> = {};
    for (const key of ['linkedin', 'github', 'portfolio'] as const) {
      const raw = input.links[key];
      if (raw === undefined) continue;
      const url = normalizeUrl(raw);
      if (raw.trim() && !url) warnings.push(`Ignored invalid ${key} URL "${cleanText(raw, 100)}".`);
      else links[key] = url;
    }
    out.links = definedEntries(links);
  }
  if (input.headline !== undefined) out.headline = text(input.headline, 160);
  if (input.summary !== undefined) out.summary = text(input.summary, MAX_LONG_TEXT);
  if (input.skills) out.skills = definedEntries({ add: uniqueStrings(input.skills.add, MAX_SKILL), remove: uniqueStrings(input.skills.remove, MAX_SKILL) });
  if (input.workAuthorization) {
    const w = input.workAuthorization;
    out.workAuthorization = definedEntries({
      countriesAuthorized: uniqueStrings(w.countriesAuthorized, 80),
      needsSponsorship: w.needsSponsorship,
      noticePeriod: text(w.noticePeriod, 80),
      availability: text(w.availability, 120),
    });
  }
  if (input.preferences) {
    const pr = input.preferences;
    out.preferences = definedEntries({
      expectedSalary: text(pr.expectedSalary, 80),
      salaryCurrency: text(pr.salaryCurrency, 10),
      workModes: pr.workModes ? [...new Set(pr.workModes)] : undefined,
      willingToRelocate: pr.willingToRelocate,
    });
  }
  if (input.experience) {
    const e = input.experience;
    out.experience = definedEntries({
      add: e.add?.slice(0, MAX_LIST).map((item) => ExtractedExperienceSchema.parse(item)),
      update: e.update?.slice(0, MAX_LIST).map((u) => {
        const current = u.current === true || (u.endDate !== undefined && /^(present|current|now)$/i.test(u.endDate.trim())) ? true : u.current;
        return {
          id: u.id,
          ...definedEntries({
            company: text(u.company),
            title: text(u.title),
            location: text(u.location),
            startDate: u.startDate === undefined ? undefined : normalizeDate(u.startDate),
            endDate: current ? '' : u.endDate === undefined ? undefined : normalizeDate(u.endDate),
            current,
            description: text(u.description, MAX_LONG_TEXT),
          }),
        };
      }),
      remove: e.remove ? [...new Set(e.remove)] : undefined,
    });
  }
  if (input.education) {
    const e = input.education;
    out.education = definedEntries({
      add: e.add?.slice(0, MAX_LIST).map((item) => ExtractedEducationSchema.parse(item)),
      update: e.update?.slice(0, MAX_LIST).map((u) => ({
        id: u.id,
        ...definedEntries({
          school: text(u.school),
          degree: text(u.degree),
          field: text(u.field),
          startDate: u.startDate === undefined ? undefined : normalizeDate(u.startDate),
          endDate: u.endDate === undefined ? undefined : normalizeDate(u.endDate),
        }),
      })),
      remove: e.remove ? [...new Set(e.remove)] : undefined,
    });
  }
  if (input.savedAnswers) {
    const a = input.savedAnswers;
    out.savedAnswers = definedEntries({
      upsert: a.upsert?.slice(0, MAX_LIST).map((x) => ({ label: cleanText(x.label, MAX_TEXT), answer: cleanText(x.answer, MAX_LONG_TEXT) })).filter((x) => x.label && x.answer),
      remove: a.remove ? [...new Set(a.remove)] : undefined,
    });
  }
  return { changes: definedEntries(out) ?? {}, warnings };
}

/** Ids referenced by updates/removals that do not exist in the profile (one message each). */
export function unknownReferences(profile: Profile, changes: ProfileChanges): string[] {
  const problems: string[] = [];
  const check = (kind: string, ids: readonly string[] | undefined, known: readonly { id: string }[]) => {
    for (const id of ids ?? []) if (!known.some((r) => r.id === id)) problems.push(`Unknown ${kind} id "${id}".`);
  };
  check('experience', [...(changes.experience?.update?.map((u) => u.id) ?? []), ...(changes.experience?.remove ?? [])], profile.experience);
  check('education', [...(changes.education?.update?.map((u) => u.id) ?? []), ...(changes.education?.remove ?? [])], profile.education);
  check('saved answer', changes.savedAnswers?.remove, profile.savedAnswers);
  return problems;
}

const concat = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined => (a || b ? [...(a ?? []), ...(b ?? [])] : undefined);

/** Adds `next` to a pending proposal's changes: later scalar values win, lists accumulate. */
export function mergeChanges(base: ProfileChanges, next: ProfileChanges): ProfileChanges {
  const merged: ProfileChanges = {
    personal: base.personal || next.personal ? { ...base.personal, ...next.personal } : undefined,
    links: base.links || next.links ? { ...base.links, ...next.links } : undefined,
    headline: next.headline ?? base.headline,
    summary: next.summary ?? base.summary,
    skills: base.skills || next.skills ? definedEntries({ add: concat(base.skills?.add, next.skills?.add), remove: concat(base.skills?.remove, next.skills?.remove) }) : undefined,
    workAuthorization: base.workAuthorization || next.workAuthorization ? { ...base.workAuthorization, ...next.workAuthorization } : undefined,
    preferences: base.preferences || next.preferences ? { ...base.preferences, ...next.preferences } : undefined,
    experience:
      base.experience || next.experience
        ? definedEntries({
            add: concat(base.experience?.add, next.experience?.add),
            update: concat(base.experience?.update, next.experience?.update),
            remove: concat(base.experience?.remove, next.experience?.remove),
          })
        : undefined,
    education:
      base.education || next.education
        ? definedEntries({
            add: concat(base.education?.add, next.education?.add),
            update: concat(base.education?.update, next.education?.update),
            remove: concat(base.education?.remove, next.education?.remove),
          })
        : undefined,
    savedAnswers:
      base.savedAnswers || next.savedAnswers
        ? definedEntries({ upsert: concat(base.savedAnswers?.upsert, next.savedAnswers?.upsert), remove: concat(base.savedAnswers?.remove, next.savedAnswers?.remove) })
        : undefined,
  };
  return definedEntries(merged) ?? {};
}

/** Number of individual changes (fields, entries, skills, answers, removals) in a proposal. */
export function countChanges(changes: ProfileChanges): number {
  const values = (o: object | undefined) => Object.values(o ?? {}).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length;
  const len = (a: readonly unknown[] | undefined) => a?.length ?? 0;
  return (
    values(changes.personal) +
    values(changes.links) +
    (changes.headline ? 1 : 0) +
    (changes.summary ? 1 : 0) +
    len(changes.skills?.add) +
    len(changes.skills?.remove) +
    values(changes.workAuthorization) +
    values(changes.preferences) +
    len(changes.experience?.add) +
    len(changes.experience?.update) +
    len(changes.experience?.remove) +
    len(changes.education?.add) +
    len(changes.education?.update) +
    len(changes.education?.remove) +
    len(changes.savedAnswers?.upsert) +
    len(changes.savedAnswers?.remove)
  );
}

/** Banner text, e.g. "3 changes proposed by Claude Code". */
export function proposalsHeadline(proposals: readonly AgentProposal[]): string {
  const total = proposals.reduce((n, p) => n + Math.max(1, countChanges(p.changes) + (p.pendingDocument ? 1 : 0)), 0);
  const clients = [...new Set(proposals.map((p) => p.client))];
  const by = clients.length <= 2 ? clients.join(' and ') : `${clients.slice(0, 2).join(', ')} and others`;
  return `${total} ${total === 1 ? 'change' : 'changes'} proposed by ${by}`;
}

/**
 * Review default: a CV import fills empty fields only (like the extension's own
 * CV import); explicit edits replace current values. The user can switch.
 */
export function proposalMergeMode(proposal: AgentProposal): MergeMode {
  return proposal.source === 'cv-import' ? 'fill-empty' : 'overwrite';
}
