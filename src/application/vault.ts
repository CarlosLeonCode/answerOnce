import { z } from 'zod';
import { emptyProfile, newId, parseProfile, SettingsSchema, type DocumentKind, type DocumentRef, type Profile } from '../domain/profile';
import type { ProfileSession, SessionStore } from '../ports/session-store';
import { DOCUMENTS_DIR, PROFILE_FILE, SETTINGS_FILE, type VaultStorage } from '../ports/vault-storage';

/**
 * The profile folder: plain files the user can open, back up or edit.
 *
 *   profile.json   the profile (everything except `ai`), its revision `rev`,
 *                  agent proposals and agent settings
 *   settings.json  AI provider settings and API keys (`ai`), agent setup paths (`agentSetup`)
 *   documents/     original document files (CVs, cover letters)
 */
export interface VaultDeps {
  storage: VaultStorage;
  session: SessionStore;
  /**
   * Whether settings.json is read and written. True for the extension, false
   * for answeronce-mcp: agents never see AI provider settings or API keys, and their
   * writes leave settings.json untouched.
   */
  withSettings: boolean;
}

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export class NotConnectedError extends VaultError {
  constructor() {
    super('The profile folder is not connected. Reconnect it in AnswerOnce.');
    this.name = 'NotConnectedError';
  }
}

export class VaultConflictError extends VaultError {
  constructor(readonly currentRevision: number) {
    super('Your profile changed since it was loaded (an agent or another window saved it). Reload it and try again.');
    this.name = 'VaultConflictError';
  }
}

const RevisionSchema = z.number().int().nonnegative().default(0);

/** Parses profile.json. A missing `rev` (e.g. a hand-written file) counts as revision 0. */
export function parseProfileFile(text: string): { profile: Profile; revision: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new VaultError(`${PROFILE_FILE} is not valid JSON. Fix or restore the file.`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new VaultError(`${PROFILE_FILE} must contain a JSON object.`);
  // Settings never live in profile.json; ignore them if someone put them there.
  const { rev, ai: _ai, agentSetup: _agentSetup, ...rest } = raw as Record<string, unknown>;
  const revision = RevisionSchema.safeParse(rev);
  if (!revision.success) throw new VaultError(`${PROFILE_FILE} has an invalid "rev" (expected a whole number).`);
  return { profile: parseProfile(rest), revision: revision.data };
}

/** profile.json content: pretty-printed, revision first, without settings (AI provider, agent setup). */
export function serializeProfile(profile: Profile, revision: number): string {
  const { ai: _ai, agentSetup: _agentSetup, ...rest } = profile;
  return `${JSON.stringify({ rev: revision, ...rest }, null, 2)}\n`;
}

function serializeSettings(profile: Profile): string {
  return `${JSON.stringify(SettingsSchema.parse({ ai: profile.ai, agentSetup: profile.agentSetup }), null, 2)}\n`;
}

async function readSettings(storage: VaultStorage): Promise<z.infer<typeof SettingsSchema>> {
  const text = await storage.readText(SETTINGS_FILE);
  if (!text) return SettingsSchema.parse({});
  try {
    return SettingsSchema.parse(JSON.parse(text));
  } catch {
    throw new VaultError(`${SETTINGS_FILE} is not valid. Fix or delete the file (it only holds AI provider settings and agent setup paths).`);
  }
}

/** Reads profile.json (plus settings.json when allowed). */
async function readProfileFile(deps: VaultDeps): Promise<{ profile: Profile; revision: number }> {
  const text = await deps.storage.readText(PROFILE_FILE);
  if (text === null) throw new VaultError(`No ${PROFILE_FILE} found in this folder.`);
  const { profile, revision } = parseProfileFile(text);
  if (!deps.withSettings) return { profile, revision };
  const settings = await readSettings(deps.storage);
  return { profile: { ...profile, ai: settings.ai, agentSetup: settings.agentSetup }, revision };
}

/** Current revision of profile.json on disk. */
export async function readProfileRevision(deps: Pick<VaultDeps, 'storage'>): Promise<number> {
  const text = await deps.storage.readText(PROFILE_FILE);
  if (text === null) throw new VaultError(`No ${PROFILE_FILE} found in this folder.`);
  return parseProfileFile(text).revision;
}

/**
 * Writes the profile. `expectedRevision` is the revision the caller's profile
 * was based on: the file on disk is checked right before the write and a
 * VaultConflictError is thrown if another writer (an agent or another window)
 * saved in between. null = brand new profile.
 */
async function writeProfile(deps: VaultDeps, profile: Profile, expectedRevision: number | null): Promise<ProfileSession> {
  const current = expectedRevision === null ? 0 : await readProfileRevision(deps);
  if (expectedRevision !== null && current !== expectedRevision) throw new VaultConflictError(current);
  const revision = current + 1;
  if (deps.withSettings) {
    const settings = serializeSettings(profile);
    if ((await deps.storage.readText(SETTINGS_FILE)) !== settings) await deps.storage.writeText(SETTINGS_FILE, settings);
  }
  await deps.storage.writeText(PROFILE_FILE, serializeProfile(profile, revision));
  const session: ProfileSession = { profile, loadedAt: new Date().toISOString(), revision };
  await deps.session.set(session);
  return session;
}

export type FolderContents = 'profile' | 'legacy' | 'empty';

/** What the folder holds: a profile, only data from an older AnswerOnce version, or nothing yet. */
export async function inspectFolder(storage: VaultStorage, legacyFile: string): Promise<FolderContents> {
  if (await storage.exists(PROFILE_FILE)) return 'profile';
  return (await storage.exists(legacyFile)) ? 'legacy' : 'empty';
}

/** Creates profile.json (and settings.json) with an empty (or the given) profile and loads it. */
export async function createProfile(deps: VaultDeps, profile: Profile = emptyProfile()): Promise<ProfileSession> {
  if (await deps.storage.exists(PROFILE_FILE)) throw new VaultError(`This folder already contains a ${PROFILE_FILE}. Open it instead.`);
  return writeProfile(deps, parseProfile(profile), null);
}

/** Reads profile.json into the memory-only session. */
export async function openProfile(deps: VaultDeps): Promise<ProfileSession> {
  const { profile, revision } = await readProfileFile(deps);
  const session: ProfileSession = { profile, loadedAt: new Date().toISOString(), revision };
  await deps.session.set(session);
  return session;
}

/**
 * Reloads the session from disk when profile.json has a newer revision
 * (written by an agent or another window).
 */
export async function syncSession(deps: VaultDeps): Promise<{ session: ProfileSession | null; changed: boolean }> {
  const current = await deps.session.get();
  if (!current) return { session: null, changed: false };
  const { profile, revision } = await readProfileFile(deps);
  if (revision === current.revision) return { session: current, changed: false };
  const session: ProfileSession = { ...current, profile, revision };
  await deps.session.set(session);
  return { session, changed: true };
}

/** Forgets the loaded profile (e.g. when switching folders). Files are not touched. */
export async function clearSession(session: SessionStore): Promise<void> {
  await session.clear();
}

export async function requireSession(session: SessionStore): Promise<ProfileSession> {
  const current = await session.get();
  if (!current) throw new NotConnectedError();
  return current;
}

/**
 * Validates and writes the profile; updates the session copy.
 * `baseRevision` is the revision the profile was edited from (defaults to the
 * session's): the write is refused with VaultConflictError if the file changed.
 */
export async function saveProfile(deps: VaultDeps, profile: Profile, baseRevision?: number): Promise<ProfileSession> {
  const current = await requireSession(deps.session);
  return writeProfile(deps, parseProfile(profile), baseRevision ?? current.revision);
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName);
  return match ? `.${match[1]!.toLowerCase()}` : '';
}

/** A readable, safe file name: "Jane Doe CV.pdf" -> "documents/Jane-Doe-CV-1a2b3c4d.pdf". */
export function documentPath(fileName: string, id: string): string {
  const ext = extensionOf(fileName);
  const stem = fileName
    .slice(0, fileName.length - ext.length)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return `${DOCUMENTS_DIR}/${stem || 'document'}-${id.slice(0, 8)}${ext}`;
}

/** Writes a document file into documents/. Does not touch the profile. */
export async function storeDocument(
  deps: VaultDeps,
  input: { kind: DocumentKind; fileName: string; mimeType: string; bytes: Uint8Array },
): Promise<DocumentRef> {
  const id = newId();
  const storedAs = documentPath(input.fileName, id);
  await deps.storage.writeBytes(storedAs, input.bytes);
  return {
    id,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    size: input.bytes.byteLength,
    storedAs,
    addedAt: new Date().toISOString(),
  };
}

/** Copies a document into documents/ and references it in the profile. */
export async function addDocument(
  deps: VaultDeps,
  input: { kind: DocumentKind; fileName: string; mimeType: string; bytes: Uint8Array },
): Promise<ProfileSession> {
  const session = await requireSession(deps.session);
  const ref = await storeDocument(deps, input);
  try {
    return await saveProfile(deps, { ...session.profile, documents: [...session.profile.documents, ref] });
  } catch (error) {
    await deps.storage.remove(ref.storedAs).catch(() => undefined);
    throw error;
  }
}

export async function removeDocument(deps: VaultDeps, documentId: string): Promise<ProfileSession> {
  const session = await requireSession(deps.session);
  const doc = session.profile.documents.find((d) => d.id === documentId);
  const { profile } = session;
  const saved = await saveProfile(deps, {
    ...profile,
    documents: profile.documents.filter((d) => d.id !== documentId),
    defaultResumeId: profile.defaultResumeId === documentId ? '' : profile.defaultResumeId,
  });
  if (doc) await deps.storage.remove(doc.storedAs).catch(() => undefined);
  return saved;
}

/** Chooses which CV is attached to resume upload fields. */
export async function setDefaultResume(deps: VaultDeps, documentId: string): Promise<ProfileSession> {
  const session = await requireSession(deps.session);
  if (!session.profile.documents.some((d) => d.id === documentId && d.kind === 'cv')) throw new VaultError('That document is not a CV.');
  return saveProfile(deps, { ...session.profile, defaultResumeId: documentId });
}

export async function readDocument(deps: VaultDeps, documentId: string): Promise<{ ref: DocumentRef; bytes: Uint8Array }> {
  const session = await requireSession(deps.session);
  const ref = session.profile.documents.find((d) => d.id === documentId);
  if (!ref) throw new VaultError('Document not found in profile.');
  const bytes = await deps.storage.readBytes(ref.storedAs);
  if (!bytes) throw new VaultError(`${ref.storedAs} is missing from the profile folder.`);
  return { ref, bytes };
}
