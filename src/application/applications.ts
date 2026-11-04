import { z } from 'zod';
import {
  ApplicationPatchSchema,
  ApplicationSchema,
  ApplicationsDataSchema,
  APPLICATIONS_SCHEMA_VERSION,
  filterApplications,
  findByUrl,
  mergeAnswers,
  patchApplication,
  recordApplied,
  recordFill,
  snapshotAnswers,
  type AnswerSnapshot,
  type Application,
  type ApplicationFilter,
  type ApplicationPatch,
  type JobInfo,
  type Upsert,
} from '../domain/applications';
import type { FrameScan } from '../domain/field';
import { pickMeta } from '../domain/job-meta';
import { newId } from '../domain/profile';
import type { AtsAdapter } from '../ports/ats-adapter';
import type { PageGateway } from '../ports/page-gateway';
import { APPLICATIONS_FILE, type VaultStorage } from '../ports/vault-storage';
import { VaultError } from './vault';

/**
 * applications.json: the jobs the user filled or applied to. A separate file
 * with its own revision `rev`, so application updates (side panel, options
 * page, answeronce-mcp) never conflict with profile edits. Same rules as
 * profile.json: pretty-printed, validated with zod on every read, atomic
 * writes, and a revision check right before every write.
 */
export interface ApplicationsDeps {
  storage: VaultStorage;
  /** Clock and id generator (overridable in tests). */
  now?: () => string;
  newId?: () => string;
}

export interface ApplicationsFile {
  applications: Application[];
  /** 0 when the file does not exist yet. */
  revision: number;
}

export class ApplicationsConflictError extends VaultError {
  constructor(readonly currentRevision: number) {
    super(`${APPLICATIONS_FILE} changed since it was read (another window or an agent saved it). Read it again and retry.`);
    this.name = 'ApplicationsConflictError';
  }
}

export class ApplicationNotFoundError extends VaultError {
  constructor(id: string) {
    super(`No application with id "${id}".`);
    this.name = 'ApplicationNotFoundError';
  }
}

const RevisionSchema = z.number().int().nonnegative().default(0);

/** Parses applications.json. A missing `rev` (e.g. a hand-written file) counts as revision 0. */
export function parseApplicationsFile(text: string): ApplicationsFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new VaultError(`${APPLICATIONS_FILE} is not valid JSON. Fix or restore the file.`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new VaultError(`${APPLICATIONS_FILE} must contain a JSON object.`);
  const { rev, ...rest } = raw as Record<string, unknown>;
  const revision = RevisionSchema.safeParse(rev);
  if (!revision.success) throw new VaultError(`${APPLICATIONS_FILE} has an invalid "rev" (expected a whole number).`);
  const data = ApplicationsDataSchema.safeParse(rest);
  if (!data.success) {
    const issue = data.error.issues[0];
    throw new VaultError(`${APPLICATIONS_FILE} is not valid${issue ? ` (${issue.path.join('.') || 'file'}: ${issue.message})` : ''}. Fix or restore the file.`);
  }
  return { applications: data.data.applications, revision: revision.data };
}

/** applications.json content: pretty-printed, revision first. */
export function serializeApplications(applications: readonly Application[], revision: number): string {
  return `${JSON.stringify({ rev: revision, schemaVersion: APPLICATIONS_SCHEMA_VERSION, applications }, null, 2)}\n`;
}

/** Reads applications.json; an absent file is an empty list at revision 0. */
export async function readApplications(storage: VaultStorage): Promise<ApplicationsFile> {
  const text = await storage.readText(APPLICATIONS_FILE);
  return text === null ? { applications: [], revision: 0 } : parseApplicationsFile(text);
}

/**
 * Writes the list. `expectedRevision` is the revision the caller's list was
 * read at: the file is checked right before the write and an
 * ApplicationsConflictError is thrown if someone else wrote in between.
 */
export async function saveApplications(storage: VaultStorage, applications: readonly Application[], expectedRevision: number): Promise<ApplicationsFile> {
  const { revision: current } = await readApplications(storage);
  if (current !== expectedRevision) throw new ApplicationsConflictError(current);
  const revision = current + 1;
  const parsed = applications.map((a) => ApplicationSchema.parse(a));
  await storage.writeText(APPLICATIONS_FILE, serializeApplications(parsed, revision));
  return { applications: parsed, revision };
}

const ATTEMPTS = 3;

/**
 * Read-modify-write with the revision check. Every change is a small update
 * of the latest file, so on a conflict it is simply re-applied to the newer
 * version (a few attempts) instead of overwriting someone else's write.
 * `mutate` returns the list it was given to leave the file untouched.
 */
export async function mutateApplications<T>(
  storage: VaultStorage,
  mutate: (applications: Application[]) => { applications: Application[]; result: T },
): Promise<{ file: ApplicationsFile; result: T }> {
  for (let attempt = 1; ; attempt++) {
    const { applications, revision } = await readApplications(storage);
    const { applications: next, result } = mutate(applications);
    // Returning the same list means "nothing to change": no write, no new revision.
    if (next === applications) return { file: { applications, revision }, result };
    try {
      return { file: await saveApplications(storage, next, revision), result };
    } catch (error) {
      if (!(error instanceof ApplicationsConflictError) || attempt >= ATTEMPTS) throw error;
    }
  }
}

const clock = (deps: ApplicationsDeps) => (deps.now ?? (() => new Date().toISOString()))();
const ids = (deps: ApplicationsDeps) => deps.newId ?? newId;

// ---------------------------------------------------------------------------
// Reading the job page

/**
 * Company, role and ATS of the job in the tab. The frame of a specific ATS
 * wins (e.g. a Greenhouse board embedded in a company site); the top frame's
 * generic heuristics fill what it does not know.
 */
export function describeJob(scans: readonly FrameScan[], adapters: readonly AtsAdapter[], tabUrl: string): JobInfo {
  const top = scans.find((s) => s.frameId === 0) ?? scans[0];
  const generic = adapters.find((a) => a.id === 'generic');
  let ats = 'generic';
  const candidates = [];
  for (const scan of scans) {
    const adapter = adapters.find((a) => a.id !== 'generic' && a.detect(scan));
    if (!adapter || !scan.meta) continue;
    if (ats === 'generic') ats = adapter.id;
    candidates.push(adapter.jobMeta(scan));
  }
  if (top?.meta && generic) candidates.push(generic.jobMeta(top));
  const meta = pickMeta(...candidates);
  return { url: tabUrl || top?.url || '', company: meta.company, role: meta.role, ats };
}

/** Answers currently on the page (all frames), without consent fields or file inputs. */
export function pageAnswers(scans: readonly FrameScan[]): AnswerSnapshot[] {
  return snapshotAnswers(scans.flatMap((s) => s.fields));
}

/** Scans the tab and returns what an application record needs. */
export async function snapshotPage(
  gateway: PageGateway,
  adapters: readonly AtsAdapter[],
  tab: { id: number; url: string },
): Promise<{ job: JobInfo; answers: AnswerSnapshot[] }> {
  const scans = await gateway.scan(tab.id);
  return { job: describeJob(scans, adapters, tab.url), answers: pageAnswers(scans) };
}

// ---------------------------------------------------------------------------
// Use cases

/** After "Fill this page": creates the record (status `filled`) or updates the one for the same posting. */
export async function recordFilledPage(deps: ApplicationsDeps, job: JobInfo, answers: readonly AnswerSnapshot[]): Promise<Upsert> {
  const at = clock(deps);
  const { result } = await mutateApplications(deps.storage, (apps) => {
    const upsert = recordFill(apps, job, answers, at, ids(deps));
    return { applications: upsert.applications, result: upsert };
  });
  return result;
}

/** "Mark as applied": final answers snapshot + status `applied` (never moves a later status back). */
export async function markApplied(deps: ApplicationsDeps, job: JobInfo, answers: readonly AnswerSnapshot[]): Promise<Upsert> {
  const at = clock(deps);
  const { result } = await mutateApplications(deps.storage, (apps) => {
    const upsert = recordApplied(apps, job, answers, at, ids(deps));
    return { applications: upsert.applications, result: upsert };
  });
  return result;
}

/**
 * An answer inserted from the panel (typed or generated). Updates the record
 * for that page; does nothing when the page has no record (e.g. it was deleted).
 */
export async function recordAnswer(deps: ApplicationsDeps, url: string, answer: AnswerSnapshot): Promise<Application | null> {
  const { result } = await mutateApplications(deps.storage, (apps) => {
    const existing = findByUrl(apps, url);
    if (!existing) return { applications: apps, result: null };
    const updated = { ...existing, answers: mergeAnswers(existing.answers, [answer]) };
    return { applications: apps.map((a) => (a.id === existing.id ? updated : a)), result: updated };
  });
  return result;
}

/** Changes status, notes, company or role of a record. Input is validated (it may come from an agent). */
export async function updateApplication(deps: ApplicationsDeps, id: string, patch: ApplicationPatch): Promise<Application> {
  const valid = ApplicationPatchSchema.parse(patch);
  const at = clock(deps);
  const { result } = await mutateApplications(deps.storage, (apps) => {
    const existing = apps.find((a) => a.id === id);
    if (!existing) throw new ApplicationNotFoundError(id);
    const updated = patchApplication(existing, valid, at);
    return { applications: apps.map((a) => (a.id === id ? updated : a)), result: updated };
  });
  return result;
}

export async function deleteApplication(deps: ApplicationsDeps, id: string): Promise<void> {
  await mutateApplications(deps.storage, (apps) => {
    if (!apps.some((a) => a.id === id)) throw new ApplicationNotFoundError(id);
    return { applications: apps.filter((a) => a.id !== id), result: undefined };
  });
}

/** Filtered, newest first. */
export async function listApplications(deps: Pick<ApplicationsDeps, 'storage'>, filter: ApplicationFilter = {}): Promise<Application[]> {
  return filterApplications((await readApplications(deps.storage)).applications, filter);
}

export async function getApplication(deps: Pick<ApplicationsDeps, 'storage'>, id: string): Promise<Application> {
  const found = (await readApplications(deps.storage)).applications.find((a) => a.id === id);
  if (!found) throw new ApplicationNotFoundError(id);
  return found;
}

/** The record for the posting at `url`, if any. */
export async function applicationForUrl(deps: Pick<ApplicationsDeps, 'storage'>, url: string): Promise<Application | null> {
  return findByUrl((await readApplications(deps.storage)).applications, url) ?? null;
}
