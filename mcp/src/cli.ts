import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireSession } from '../../src/application/vault';
import { PROFILE_FILE, SETTINGS_FILE } from '../../src/ports/vault-storage';
import { writeConfig } from './config';
import { checkFolder, describeSource, FOLDER_ENV, resolveFolder, type FolderInputs } from './folder';
import { ProfileFolder } from './profile-folder';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export interface CliDeps {
  io: CliIo;
  configPath: string;
  /** Config of versions released as "Hire", read when configPath has none. */
  legacyConfigPath?: string;
  version: string;
  /** How to find the profile folder (status). Default: only the config file. */
  folder?: FolderInputs;
}

export const USAGE = `answeronce-mcp: local MCP server for the AnswerOnce profile folder (stdio).

Usage:
  answeronce-mcp                      Start the MCP server on stdio (what agents run)
  answeronce-mcp status               Show the folder, revision and pending proposals
  answeronce-mcp init --folder <dir>  Remember the profile folder in the config file (optional)
  answeronce-mcp help | --version

The profile folder (the one with ${PROFILE_FILE} that you chose in the AnswerOnce
extension) is the first of:
  1. --folder <dir> (--vault works too)
  2. the ${FOLDER_ENV} environment variable
  3. the config file written by "answeronce-mcp init"
  4. the folder this script is in, when it is <dir>/.answeronce/answeronce-mcp.js
     (the AnswerOnce extension puts it there: Profile → AI agents)

Options:
  --config <file>               Config file (default: ~/.config/answeronce/config.json or the
                                OS equivalent; also ANSWERONCE_MCP_CONFIG)

Agents read and propose changes to ${PROFILE_FILE}. They never read ${SETTINGS_FILE}
(AI provider settings and API keys).`;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(process.env.HOME ?? '', p.slice(1)) : p;
}

async function init(args: string[], deps: CliDeps): Promise<number> {
  const raw = option(args, '--folder') ?? option(args, '--vault');
  if (!raw) {
    deps.io.err('Usage: answeronce-mcp init --folder <dir>');
    return 2;
  }
  const folder = path.resolve(expandHome(raw));
  const stat = await fs.stat(folder).catch(() => null);
  if (!stat?.isDirectory()) {
    deps.io.err(`Not a directory: ${folder}`);
    return 1;
  }
  await writeConfig(deps.configPath, { folder });
  const info = await new ProfileFolder(folder).info();
  deps.io.out(`Profile folder set to ${folder}`);
  deps.io.out(`Config: ${deps.configPath}`);
  if (info.legacy) deps.io.out('Note: this folder has data from an older AnswerOnce version. Open the AnswerOnce extension and import it first.');
  else if (!info.found) deps.io.out(`Note: no ${PROFILE_FILE} there yet. Set up this folder in the AnswerOnce extension first.`);
  deps.io.out('Agents connected through answeronce-mcp can now read the profile sections they ask for and propose changes.');
  return 0;
}

async function status(deps: CliDeps): Promise<number> {
  const resolved = await resolveFolder(deps.folder ?? { env: {}, configPath: deps.configPath, legacyConfigPath: deps.legacyConfigPath });
  if (!resolved) {
    deps.io.out(`Profile folder not set. Use --folder <dir>, set ${FOLDER_ENV}, or run "answeronce-mcp init --folder <dir>". (config: ${deps.configPath})`);
    return 1;
  }
  deps.io.out(`Profile folder: ${resolved.folder} (from ${describeSource(resolved.source)})`);
  await checkFolder(resolved);
  const folder = new ProfileFolder(resolved.folder);
  const info = await folder.info();
  if (!info.found) {
    deps.io.out(info.legacy ? 'Profile: not imported yet (data from an older AnswerOnce version; import it in the extension).' : `Profile: not found (no ${PROFILE_FILE}).`);
    return 1;
  }
  const { deps: profile } = await folder.open();
  const session = await requireSession(profile.session);
  deps.io.out(`Revision: ${info.revision}`);
  deps.io.out(`Direct write: ${session.profile.agents.directWrite ? 'on (agents change the profile without review)' : 'off (agents propose, you review in the extension)'}`);
  deps.io.out(`Pending proposals: ${session.profile.agentProposals.length}`);
  return 0;
}

/** Runs a CLI command and returns the process exit code. */
export async function runCli(args: string[], deps: CliDeps): Promise<number> {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case 'init':
        return await init(rest, deps);
      case 'status':
        return await status(deps);
      case '--version':
      case 'version':
        deps.io.out(deps.version);
        return 0;
      case 'help':
      case '--help':
      case '-h':
        deps.io.out(USAGE);
        return 0;
      default:
        deps.io.err(`Unknown command: ${command}\n\n${USAGE}`);
        return 2;
    }
  } catch (error) {
    deps.io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
