import { z } from 'zod';
import { AgentSetupSchema } from './agent-setup';

/**
 * The user's profile. This is the ONLY place personal data lives. It is
 * persisted as plain files in the folder the user picked: profile.json (all of
 * it except `ai` and `agentSetup`), settings.json (`ai`, `agentSetup`) and documents/.
 */

export const LLM_PROVIDERS = ['none', 'ollama', 'openai', 'gemini', 'claude'] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const DOCUMENT_KINDS = ['cv', 'cover_letter', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const str = z.string().default('');

export const PersonalSchema = z.object({
  firstName: str,
  lastName: str,
  preferredName: str,
  email: str,
  phone: str,
  location: str,
  city: str,
  country: str,
  pronouns: str,
});

export const LinksSchema = z.object({
  linkedin: str,
  github: str,
  portfolio: str,
  other: z.array(z.object({ label: str, url: str })).default([]),
});

export const WorkAuthorizationSchema = z.object({
  countriesAuthorized: z.array(z.string()).default([]),
  needsSponsorship: z.boolean().nullable().default(null),
  noticePeriod: str,
  availability: str,
});

export const PreferencesSchema = z.object({
  expectedSalary: str,
  salaryCurrency: str,
  workModes: z.array(z.enum(WORK_MODES)).default([]),
  willingToRelocate: z.boolean().nullable().default(null),
});

export const ExperienceSchema = z.object({
  id: z.string(),
  company: str,
  title: str,
  location: str,
  startDate: str,
  endDate: str,
  current: z.boolean().default(false),
  description: str,
});

export const EducationSchema = z.object({
  id: z.string(),
  school: str,
  degree: str,
  field: str,
  startDate: str,
  endDate: str,
});

export const DocumentRefSchema = z.object({
  id: z.string(),
  kind: z.enum(DOCUMENT_KINDS),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  /** Path of the original file inside the profile folder, e.g. "documents/cv-1a2b3c4d.pdf". */
  storedAs: z.string(),
  addedAt: z.string(),
});

export const SavedAnswerSchema = z.object({
  id: z.string(),
  label: z.string(),
  answer: z.string(),
  updatedAt: z.string(),
});

export const AiSettingsSchema = z.object({
  provider: z.enum(LLM_PROVIDERS).default('none'),
  model: str,
  apiKey: str,
  ollamaBaseUrl: z.string().default('http://localhost:11434'),
});

// ---------------------------------------------------------------------------
// Agent proposals: changes suggested by an AI agent through the local answeronce-mcp
// server. They live inside profile.json and are applied only when the
// user accepts them in the extension (unless direct write is turned on).

const optText = z.string().optional();
const optFlag = z.boolean().nullable().optional();

export const ExperienceFieldsSchema = z
  .object({ company: str, title: str, location: str, startDate: str, endDate: str, current: z.boolean().default(false), description: str })
  .strict();
const ExperiencePatchSchema = z
  .object({ id: z.string(), company: optText, title: optText, location: optText, startDate: optText, endDate: optText, current: z.boolean().optional(), description: optText })
  .strict();

export const EducationFieldsSchema = z.object({ school: str, degree: str, field: str, startDate: str, endDate: str }).strict();
const EducationPatchSchema = z
  .object({ id: z.string(), school: optText, degree: optText, field: optText, startDate: optText, endDate: optText })
  .strict();

const ids = z.array(z.string()).optional();

/**
 * A partial set of profile changes. Strict: unknown keys are rejected, so a
 * proposal can never touch AI settings, agent settings or documents.
 */
export const ProfileChangesSchema = z
  .object({
    personal: z
      .object({ firstName: optText, lastName: optText, preferredName: optText, email: optText, phone: optText, location: optText, city: optText, country: optText, pronouns: optText })
      .strict()
      .optional(),
    links: z.object({ linkedin: optText, github: optText, portfolio: optText }).strict().optional(),
    headline: optText,
    summary: optText,
    skills: z.object({ add: ids, remove: ids }).strict().optional(),
    workAuthorization: z
      .object({ countriesAuthorized: z.array(z.string()).optional(), needsSponsorship: optFlag, noticePeriod: optText, availability: optText })
      .strict()
      .optional(),
    preferences: z
      .object({ expectedSalary: optText, salaryCurrency: optText, workModes: z.array(z.enum(WORK_MODES)).optional(), willingToRelocate: optFlag })
      .strict()
      .optional(),
    experience: z.object({ add: z.array(ExperienceFieldsSchema).optional(), update: z.array(ExperiencePatchSchema).optional(), remove: ids }).strict().optional(),
    education: z.object({ add: z.array(EducationFieldsSchema).optional(), update: z.array(EducationPatchSchema).optional(), remove: ids }).strict().optional(),
    savedAnswers: z
      .object({ upsert: z.array(z.object({ label: z.string(), answer: z.string() }).strict()).optional(), remove: ids })
      .strict()
      .optional(),
  })
  .strict();

export const PROPOSAL_SOURCES = ['update', 'cv-import'] as const;

export const AgentProposalSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  /** Name of the MCP client that proposed it (from the MCP initialize handshake). */
  client: z.string().default('AI agent'),
  /** Short description written by the agent for the user. */
  summary: str,
  source: z.enum(PROPOSAL_SOURCES).default('update'),
  changes: ProfileChangesSchema.prefault({}),
  /** CV file already in the documents folder, attached on accept. */
  pendingDocument: DocumentRefSchema.nullable().default(null),
});

export const AgentSettingsSchema = z.object({
  /** Opt-in, toggled only from the extension UI: agents write without review. */
  directWrite: z.boolean().default(false),
});

/**
 * Version history:
 *  1: initial schema.
 *  2: adds headline, summary, skills and defaultResumeId (all defaulted, so v1
 *     profiles migrate by bumping the version).
 *  3: adds agentProposals and agents (defaulted). Bumped so that older builds
 *     refuse the profile instead of silently dropping pending proposals.
 */
export const PROFILE_SCHEMA_VERSION = 3;

export const ProfileSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION).default(PROFILE_SCHEMA_VERSION),
  personal: PersonalSchema.prefault({}),
  links: LinksSchema.prefault({}),
  /** Short professional title, e.g. "Senior Backend Engineer". */
  headline: str,
  /** A few sentences about the candidate, as written in their CV. */
  summary: str,
  skills: z.array(z.string()).default([]),
  workAuthorization: WorkAuthorizationSchema.prefault({}),
  preferences: PreferencesSchema.prefault({}),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  documents: z.array(DocumentRefSchema).default([]),
  /** Document id of the CV attached to resume upload fields ('' = first CV). */
  defaultResumeId: str,
  savedAnswers: z.array(SavedAnswerSchema).default([]),
  ai: AiSettingsSchema.prefault({}),
  agentProposals: z.array(AgentProposalSchema).default([]),
  agents: AgentSettingsSchema.prefault({}),
  /** Paths for the AI agents setup page. Stored in settings.json, like `ai`. */
  agentSetup: AgentSetupSchema.prefault({}),
});

/**
 * settings.json: what the extension keeps out of profile.json, so agents never
 * read it. `agentSetup` was added later; files without it stay valid.
 */
export const SettingsSchema = z.object({
  ai: AiSettingsSchema.prefault({}),
  agentSetup: AgentSetupSchema.prefault({}),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type DocumentRef = z.infer<typeof DocumentRefSchema>;
export type SavedAnswer = z.infer<typeof SavedAnswerSchema>;
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type ProfileChanges = z.infer<typeof ProfileChangesSchema>;
export type AgentProposal = z.infer<typeof AgentProposalSchema>;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];

export function emptyProfile(): Profile {
  return ProfileSchema.parse({});
}

export class UnsupportedProfileVersionError extends Error {
  constructor(version: unknown) {
    super(`This profile was written by a newer version of AnswerOnce (profile schema ${String(version)}). Update the extension.`);
    this.name = 'UnsupportedProfileVersionError';
  }
}

/** Upgrades older profile JSON to the current schema version. */
export function migrateProfile(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const raw = input as Record<string, unknown>;
  const version = raw.schemaVersion ?? 1;
  if (typeof version !== 'number' || version > PROFILE_SCHEMA_VERSION) throw new UnsupportedProfileVersionError(version);
  // v1 -> v2 -> v3: new fields are filled by schema defaults.
  return { ...raw, schemaVersion: PROFILE_SCHEMA_VERSION };
}

/** Parses untrusted JSON (e.g. profile.json, edited by hand or by an agent), migrating and filling defaults. */
export function parseProfile(input: unknown): Profile {
  return ProfileSchema.parse(migrateProfile(input));
}

/** The CV attached to resume fields: the chosen default, else the first CV. */
export function defaultResume(profile: Profile): DocumentRef | undefined {
  const cvs = profile.documents.filter((d) => d.kind === 'cv');
  return cvs.find((d) => d.id === profile.defaultResumeId) ?? cvs[0];
}

export function fullName(profile: Profile): string {
  return [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ').trim();
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}
