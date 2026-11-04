import { CONNECTOR_DIR } from '../domain/agent-setup';

/**
 * The profile folder the user picked on their own disk. Holds plain, readable
 * files: profile.json, settings.json, applications.json and documents/.
 * Names are relative paths of at most one folder plus a file name
 * (e.g. "profile.json", "documents/cv-1a2b3c4d.pdf").
 * Implementations: File System Access API (extension), Node (answeronce-mcp), in-memory (tests).
 */
export interface VaultStorage {
  readText(name: string): Promise<string | null>;
  writeText(name: string, content: string): Promise<void>;
  readBytes(name: string): Promise<Uint8Array | null>;
  writeBytes(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

/** The profile, its revision, agent proposals and agent settings. Read by answeronce-mcp. */
export const PROFILE_FILE = 'profile.json';
/** AI provider settings and API keys. Read and written by the extension only, never by answeronce-mcp. */
export const SETTINGS_FILE = 'settings.json';
/** Jobs the user filled or applied to, with their own revision. Read and written by the extension and answeronce-mcp. */
export const APPLICATIONS_FILE = 'applications.json';
/** Folder with the original document files (CVs, cover letters). */
export const DOCUMENTS_DIR = 'documents';
/**
 * Hidden folder with the answeronce-mcp connector script that AI agents run
 * (written by the extension), and the script itself. answeronce-mcp finds the
 * profile folder from this location.
 */
export { CONNECTOR_DIR, CONNECTOR_SCRIPT_PATH as CONNECTOR_SCRIPT } from '../domain/agent-setup';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Splits a storage name into path segments, refusing anything that could
 * escape the folder: absolute paths, "..", hidden files, deeper nesting.
 * The only hidden name allowed is the connector folder (".answeronce/<file>").
 */
export function storagePath(name: string): string[] {
  const segments = name.split('/');
  const hidden = (s: string, i: number) => s.startsWith('.') && !(i === 0 && segments.length === 2 && s === CONNECTOR_DIR);
  if (segments.length > 2 || segments.some((s, i) => !SAFE_SEGMENT.test(s) || hidden(s, i))) {
    throw new Error(`Invalid file name in the profile folder: ${name}`);
  }
  return segments;
}
