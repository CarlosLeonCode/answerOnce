import { fileURLToPath } from 'node:url';
import { createNodeTextExtractor } from '../../src/infrastructure/text-extraction/node';
import { runCli } from './cli';
import { defaultConfigPath, legacyConfigPath } from './config';
import type { FolderInputs } from './folder';
import { serve } from './serve';

/** Replaced at build time (mcp/build.ts). */
declare const __ANSWERONCE_MCP_VERSION__: string | undefined;
const VERSION = typeof __ANSWERONCE_MCP_VERSION__ === 'string' ? __ANSWERONCE_MCP_VERSION__ : 'dev';

/** Removes `name <value>` or `name=<value>` from args and returns the value. */
function takeOption(args: string[], name: string): string | undefined {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return undefined;
  if (args[i] !== name) return args.splice(i, 1)[0]!.slice(name.length + 1);
  const [, value] = args.splice(i, 2);
  return value;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const explicitConfig = takeOption(args, '--config');
  const configPath = explicitConfig ?? defaultConfigPath();
  // Only the default location falls back to the old "hire" config folder.
  const legacy = explicitConfig ? undefined : legacyConfigPath();
  const io = {
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
  };
  // "init --folder <dir>" stores the folder; everywhere else --folder picks it for this run.
  if (args[0] === 'init') return runCli(args, { configPath, version: VERSION, io });

  const folder: FolderInputs = {
    argument: takeOption(args, '--folder') ?? takeOption(args, '--vault'),
    env: process.env,
    configPath,
    legacyConfigPath: legacy,
    // As typed in the agent's config (import.meta.url would resolve symlinks).
    scriptPath: process.argv[1] ?? fileURLToPath(import.meta.url),
  };
  if (args.length === 0 || args[0] === 'serve') {
    await serve({ folder, extractor: createNodeTextExtractor, version: VERSION });
    return -1; // keep running until the client closes stdin
  }
  return runCli(args, { configPath, legacyConfigPath: legacy, version: VERSION, io, folder });
}

main().then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
