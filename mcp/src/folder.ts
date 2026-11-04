import { promises as fs } from 'node:fs';
import path from 'node:path';
import { VaultError } from '../../src/application/vault';
import { CONNECTOR_DIR } from '../../src/ports/vault-storage';
import { readConfig } from './config';
import { ProfileFolder } from './profile-folder';

/** Where the profile folder came from, in the order they are tried. */
export type FolderSource = 'argument' | 'env' | 'config' | 'script';

export interface ResolvedFolder {
  folder: string;
  source: FolderSource;
}

export interface FolderInputs {
  /** --folder (or --vault) on the command line. */
  argument?: string;
  /** Environment, for ANSWERONCE_FOLDER (set by the Claude Desktop extension). */
  env: NodeJS.ProcessEnv;
  /** Config written by "answeronce-mcp init". */
  configPath: string;
  /** Config of versions released as "Hire", read only when configPath has none. */
  legacyConfigPath?: string;
  /** Absolute path of this script: <folder>/.answeronce/answeronce-mcp.js means <folder>. */
  scriptPath?: string;
}

export const FOLDER_ENV = 'ANSWERONCE_FOLDER';
/** Set by bundles of versions released as "Hire"; still accepted. */
export const LEGACY_FOLDER_ENV = 'HIRE_FOLDER';

export const NOT_SET_UP =
  'answeronce-mcp does not know where the AnswerOnce profile folder is. Ask the user to open the AnswerOnce extension (Profile → AI agents) and follow the steps for their agent. ' +
  `Developers can also start answeronce-mcp with --folder <dir>, set ${FOLDER_ENV}, or run "answeronce-mcp init --folder <dir>".`;

const SOURCE_LABELS: Record<FolderSource, string> = {
  argument: 'the --folder option',
  env: `the ${FOLDER_ENV} setting`,
  config: 'the answeronce-mcp config',
  script: 'the location of answeronce-mcp',
};

const FIXES: Record<FolderSource, string> = {
  argument: "Fix the --folder path in the agent's MCP settings.",
  env: `In Claude Desktop, open Settings → Extensions → AnswerOnce and choose the profile folder again. Otherwise fix ${FOLDER_ENV}.`,
  config: 'Run "answeronce-mcp init --folder <dir>" again with the right folder.',
  script: 'Open the AnswerOnce extension (Profile → AI agents) and add the connector to the profile folder again.',
};

function expandHome(p: string, env: NodeJS.ProcessEnv): string {
  const home = env.HOME ?? env.USERPROFILE ?? '';
  return home && (p === '~' || p.startsWith('~/')) ? path.join(home, p.slice(1)) : p;
}

/** A usable path value: not blank and not an unsubstituted "${...}" placeholder. */
function given(value: string | undefined): string | null {
  const v = value?.trim();
  return v && !/^\$\{.*\}$/.test(v) ? v : null;
}

/** <folder> when the script lives at <folder>/.answeronce/<file>, else null. */
export function folderFromScriptPath(scriptPath: string | undefined): string | null {
  if (!scriptPath) return null;
  const dir = path.dirname(path.resolve(scriptPath));
  return path.basename(dir) === CONNECTOR_DIR ? path.dirname(dir) : null;
}

/**
 * Finds the profile folder: --folder, then ANSWERONCE_FOLDER (or the legacy
 * HIRE_FOLDER), then the config
 * written by "answeronce-mcp init", then the script's own location. null if none
 * applies. Does not check that the folder exists (see openFolder).
 */
export async function resolveFolder(inputs: FolderInputs): Promise<ResolvedFolder | null> {
  const argument = given(inputs.argument);
  if (argument) return { folder: path.resolve(expandHome(argument, inputs.env)), source: 'argument' };
  const env = given(inputs.env[FOLDER_ENV]) ?? given(inputs.env[LEGACY_FOLDER_ENV]);
  if (env) return { folder: path.resolve(expandHome(env, inputs.env)), source: 'env' };
  const config = (await readConfig(inputs.configPath)) ?? (inputs.legacyConfigPath ? await readConfig(inputs.legacyConfigPath) : null);
  if (config) return { folder: path.resolve(expandHome(config.folder, inputs.env)), source: 'config' };
  const fromScript = folderFromScriptPath(inputs.scriptPath);
  if (fromScript) return { folder: fromScript, source: 'script' };
  return null;
}

/** Human description of where the folder came from, e.g. "the ANSWERONCE_FOLDER setting". */
export function describeSource(source: FolderSource): string {
  return SOURCE_LABELS[source];
}

/**
 * Checks that a resolved folder can be listed. On macOS, privacy protection
 * (Documents, Desktop, iCloud Drive...) fails here with EPERM, not on stat.
 */
export async function checkFolder({ folder, source }: ResolvedFolder): Promise<void> {
  try {
    await (await fs.opendir(folder)).close();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new VaultError(`The AnswerOnce profile folder ${folder} (from ${SOURCE_LABELS[source]}) does not exist. ${FIXES[source]}`);
    }
    if (code === 'EPERM' || code === 'EACCES') {
      throw new VaultError(
        `The system blocked access to the AnswerOnce profile folder ${folder}. On macOS, open System Settings → Privacy & Security → Files and Folders ` +
          '(or Full Disk Access) and allow the app that runs this agent (for example Claude, your terminal or your editor), then try again.',
      );
    }
    throw error;
  }
}

/** Resolves and checks the folder, with an error message that says what to do. */
export async function openFolder(inputs: FolderInputs): Promise<ProfileFolder> {
  const resolved = await resolveFolder(inputs);
  if (!resolved) throw new VaultError(NOT_SET_UP);
  await checkFolder(resolved);
  return new ProfileFolder(resolved.folder);
}
