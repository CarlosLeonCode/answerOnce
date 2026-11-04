import { z } from 'zod';
import { isConsentField } from './consent';
import { isEmptyValue, type FieldDescriptor } from './field';
import { normalize } from './text';

/**
 * Application tracking: one record per job the user filled or applied to.
 * Kept in applications.json, separate from profile.json, so application
 * updates never conflict with profile edits.
 */

export const APPLICATION_STATUSES = ['filled', 'applied', 'interview', 'offer', 'rejected'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  filled: 'Filled',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
};

/** Limits that keep applications.json readable and bounded. */
export const MAX_ANSWERS = 200;
export const MAX_ANSWER_CHARS = 4000;
export const MAX_LABEL_CHARS = 300;
export const MAX_NOTES_CHARS = 10_000;
export const MAX_META_CHARS = 200;

const str = z.string().default('');

export const AnswerSnapshotSchema = z.object({ label: z.string(), value: z.string() });
export type AnswerSnapshot = z.infer<typeof AnswerSnapshotSchema>;

export const StatusChangeSchema = z.object({ status: z.enum(APPLICATION_STATUSES), at: z.string() });
export type StatusChange = z.infer<typeof StatusChangeSchema>;

export const ApplicationSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  normalizedUrl: z.string(),
  company: str,
  role: str,
  /** ATS adapter id: greenhouse, lever, ashby or generic. */
  ats: z.string().default('generic'),
  createdAt: z.string(),
  status: z.enum(APPLICATION_STATUSES).default('filled'),
  statusHistory: z.array(StatusChangeSchema).default([]),
  notes: str,
  answers: z.array(AnswerSnapshotSchema).default([]),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const APPLICATIONS_SCHEMA_VERSION = 1;

/** applications.json without `rev` (handled by the application layer). */
export const ApplicationsDataSchema = z.object({
  schemaVersion: z.literal(APPLICATIONS_SCHEMA_VERSION).default(APPLICATIONS_SCHEMA_VERSION),
  applications: z.array(ApplicationSchema).default([]),
});

// ---------------------------------------------------------------------------
// URL normalization (duplicate detection)

/**
 * Query parameters that only say how the user got to the page. Everything
 * else is kept, in particular ATS job ids on embedded boards (gh_jid,
 * ashby_jid, lever ids live in the path).
 */
const TRACKING_PARAMS = new Set([
  'gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'igshid', 'mc_cid', 'mc_eid',
  '_hsenc', '_hsmi', 'mkt_tok', 'trk', 'trkinfo', 'refid', 'trackingid', 'ref', 'referrer', 'source', 'src', 'via',
  'gh_src', 'lever-source', 'lever-source[]', 'lever-origin', 'lever-via', 'ashby_src', 'utm',
]);

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('utm_') || TRACKING_PARAMS.has(n);
}

/** Path suffixes that point at the same job as the posting page. */
const APPLY_SUFFIX: { host: RegExp; suffix: RegExp }[] = [
  { host: /(^|\.)lever\.co$/, suffix: /\/apply$/ },
  { host: /(^|\.)ashbyhq\.com$/, suffix: /\/application$/ },
];

/**
 * A stable key for "the same job posting": lowercase host without "www.",
 * no hash, no tracking parameters, remaining parameters sorted, no trailing
 * slash, and ATS "apply" sub-pages folded into the posting
 * (jobs.lever.co/acme/123/apply -> jobs.lever.co/acme/123).
 * Returns the trimmed input for strings that are not http(s) URLs.
 */
export function normalizeJobUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw.trim();
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  for (const rule of APPLY_SUFFIX) if (rule.host.test(host)) pathname = pathname.replace(rule.suffix, '');
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${host}${port}${pathname || '/'}${query}`;
}

/** The record for the same job posting as `url` (most recent first), if any. */
export function findByUrl(applications: readonly Application[], url: string): Application | undefined {
  const key = normalizeJobUrl(url);
  return sortNewestFirst(applications.filter((a) => a.normalizedUrl === key))[0];
}

// ---------------------------------------------------------------------------
// Status transitions

const RANK: Record<ApplicationStatus, number> = { filled: 0, applied: 1, interview: 2, offer: 3, rejected: 3 };

/** True once the user applied: applied, interview, offer or rejected. */
export function hasApplied(status: ApplicationStatus): boolean {
  return RANK[status] >= RANK.applied;
}

/**
 * Sets the status and records it in the history. Any change is allowed (the
 * user may correct a mistake); setting the current status again is a no-op.
 */
export function changeStatus(app: Application, status: ApplicationStatus, at: string): Application {
  if (app.status === status) return app;
  return { ...app, status, statusHistory: [...app.statusHistory, { status, at }] };
}

/** Moves the record to `applied` unless it is already there or later; never goes back. */
export function advanceToApplied(app: Application, at: string): Application {
  return hasApplied(app.status) ? app : changeStatus(app, 'applied', at);
}

/** When the user first marked the job as applied (from the history), if ever. */
export function appliedAt(app: Application): string | null {
  return app.statusHistory.find((h) => h.status !== 'filled')?.at ?? (hasApplied(app.status) ? app.createdAt : null);
}

// ---------------------------------------------------------------------------
// Answers

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function clipValue(text: string): string {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  return clean.length > MAX_ANSWER_CHARS ? `${clean.slice(0, MAX_ANSWER_CHARS - 1)}…` : clean;
}

/** Visible label of a field, as shown in the panel. */
export function fieldLabel(field: Pick<FieldDescriptor, 'label' | 'ariaLabel' | 'placeholder' | 'name'>): string {
  return field.label || field.ariaLabel || field.placeholder || field.name;
}

/** Can this field's value be kept in a snapshot? Never consent fields or file inputs. */
export function isSnapshotField(field: FieldDescriptor): boolean {
  return field.kind !== 'file' && !isConsentField(field);
}

function displayValue(field: FieldDescriptor): string {
  if (field.kind === 'checkbox' && field.options.length === 0) return 'Yes';
  return field.currentValue;
}

/**
 * The answers on a page: label + final value of every answered field, in page
 * order. Empty fields, consent fields and file inputs are never included.
 * Labels repeated on the page are kept once (first answer wins).
 */
export function snapshotAnswers(fields: readonly FieldDescriptor[]): AnswerSnapshot[] {
  const out: AnswerSnapshot[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!isSnapshotField(field) || isEmptyValue(field)) continue;
    const label = clip(fieldLabel(field), MAX_LABEL_CHARS);
    const value = clipValue(displayValue(field));
    const key = normalize(label);
    if (!label || !value || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
    if (out.length >= MAX_ANSWERS) break;
  }
  return out;
}

/** Adds or replaces answers by label (case and accent insensitive), keeping the original order. */
export function mergeAnswers(existing: readonly AnswerSnapshot[], incoming: readonly AnswerSnapshot[]): AnswerSnapshot[] {
  const result = [...existing];
  for (const answer of incoming) {
    const label = clip(answer.label, MAX_LABEL_CHARS);
    const value = clipValue(answer.value);
    if (!label || !value) continue;
    const i = result.findIndex((a) => normalize(a.label) === normalize(label));
    if (i >= 0) result[i] = { label, value };
    else if (result.length < MAX_ANSWERS) result.push({ label, value });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Records

export interface JobInfo {
  url: string;
  company: string;
  role: string;
  ats: string;
}

const meta = (text: string) => clip(text, MAX_META_CHARS);

/** A new record for a job page, in the given status. */
export function newApplication(job: JobInfo, status: ApplicationStatus, at: string, id: string): Application {
  return ApplicationSchema.parse({
    id,
    url: job.url,
    normalizedUrl: normalizeJobUrl(job.url),
    company: meta(job.company),
    role: meta(job.role),
    ats: job.ats || 'generic',
    createdAt: at,
    status,
    statusHistory: [{ status, at }],
    notes: '',
    answers: [],
  });
}

/** Company and role found on the page fill gaps only: values the user edited are kept. */
function withJobInfo(app: Application, job: JobInfo): Application {
  return {
    ...app,
    company: app.company || meta(job.company),
    role: app.role || meta(job.role),
    ats: app.ats === 'generic' && job.ats ? job.ats : app.ats,
  };
}

export type Upsert = { applications: Application[]; application: Application; created: boolean };

function upsert(applications: readonly Application[], job: JobInfo, at: string, newId: () => string, update: (app: Application) => Application, status: ApplicationStatus): Upsert {
  const existing = findByUrl(applications, job.url);
  if (existing) {
    const application = update(withJobInfo(existing, job));
    return { applications: applications.map((a) => (a.id === existing.id ? application : a)), application, created: false };
  }
  const application = update(newApplication(job, status, at, newId()));
  return { applications: [...applications, application], application, created: true };
}

/**
 * After "Fill this page": creates the record (status `filled`) or, when the
 * same posting is already recorded, merges the answers into it. The status
 * never goes back (a job already applied to stays applied).
 */
export function recordFill(applications: readonly Application[], job: JobInfo, answers: readonly AnswerSnapshot[], at: string, newId: () => string): Upsert {
  return upsert(applications, job, at, newId, (app) => ({ ...app, answers: mergeAnswers(app.answers, answers) }), 'filled');
}

/**
 * "Mark as applied": replaces the answers with the final snapshot of the page
 * and moves the record to `applied` (creating it if the page was never filled).
 */
export function recordApplied(applications: readonly Application[], job: JobInfo, answers: readonly AnswerSnapshot[], at: string, newId: () => string): Upsert {
  return upsert(applications, job, at, newId, (app) => advanceToApplied({ ...app, answers: mergeAnswers([], answers) }, at), 'applied');
}

export const ApplicationPatchSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    notes: z.string().max(MAX_NOTES_CHARS).optional(),
    company: z.string().max(MAX_META_CHARS).optional(),
    role: z.string().max(MAX_META_CHARS).optional(),
  })
  .strict();
export type ApplicationPatch = z.infer<typeof ApplicationPatchSchema>;

/** Applies a user edit (status, notes, company, role). */
export function patchApplication(app: Application, patch: ApplicationPatch, at: string): Application {
  let next: Application = { ...app };
  if (patch.notes !== undefined) next.notes = patch.notes.replace(/\r\n?/g, '\n');
  if (patch.company !== undefined) next.company = meta(patch.company);
  if (patch.role !== undefined) next.role = meta(patch.role);
  if (patch.status !== undefined) next = changeStatus(next, patch.status, at);
  return next;
}

// ---------------------------------------------------------------------------
// Listing

export function sortNewestFirst(applications: readonly Application[]): Application[] {
  return [...applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export interface ApplicationFilter {
  status?: ApplicationStatus | null;
  /** ISO date or date-time: only records created at or after it. */
  since?: string | null;
  /** Free text matched against role, company, URL and notes (case and accent insensitive). */
  query?: string | null;
}

/** Filters and sorts newest first. */
export function filterApplications(applications: readonly Application[], filter: ApplicationFilter = {}): Application[] {
  const query = normalize(filter.query ?? '');
  const since = filter.since ? Date.parse(filter.since) : NaN;
  return sortNewestFirst(
    applications.filter((a) => {
      if (filter.status && a.status !== filter.status) return false;
      if (!Number.isNaN(since) && !(Date.parse(a.createdAt) >= since)) return false;
      if (query && !normalize([a.role, a.company, a.url, a.notes].join(' ')).includes(query)) return false;
      return true;
    }),
  );
}

/** Monday 00:00 (local time) of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Jobs applied to since `since` (by the date they were first marked applied). */
export function countAppliedSince(applications: readonly Application[], since: Date): number {
  return applications.filter((a) => {
    const at = appliedAt(a);
    return at !== null && Date.parse(at) >= since.getTime();
  }).length;
}

/** "Senior Engineer at Acme", with sensible fallbacks. */
export function applicationTitle(app: Pick<Application, 'role' | 'company' | 'url'>): string {
  if (app.role && app.company) return `${app.role} at ${app.company}`;
  if (app.role || app.company) return app.role || app.company;
  try {
    return new URL(app.url).hostname.replace(/^www\./, '');
  } catch {
    return app.url || 'Untitled application';
  }
}
