import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** answeronce-mcp configuration: where the profile folder is. Nothing secret. */
export interface AnswerOnceMcpConfig {
  folder: string;
}

const CONFIG_DIR = 'answeronce';
/** Config folder of versions released as "Hire": read as a fallback, never written. */
const LEGACY_CONFIG_DIR = 'hire';

function overridden(env: NodeJS.ProcessEnv): string | undefined {
  return env.ANSWERONCE_MCP_CONFIG || env.HIRE_MCP_CONFIG || undefined;
}

function configIn(dir: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string): string {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', dir, 'config.json');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), dir, 'config.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), dir, 'config.json');
}

/** ~/.config/answeronce/config.json or the OS equivalent. ANSWERONCE_MCP_CONFIG (or the legacy HIRE_MCP_CONFIG) overrides it. */
export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = os.homedir()): string {
  const override = overridden(env);
  return override ? path.resolve(override) : configIn(CONFIG_DIR, env, platform, home);
}

/** The config location of versions released as "Hire", unless the config path is overridden. */
export function legacyConfigPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = os.homedir()): string | undefined {
  return overridden(env) ? undefined : configIn(LEGACY_CONFIG_DIR, env, platform, home);
}

export async function readConfig(file: string): Promise<AnswerOnceMcpConfig | null> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const parsed = JSON.parse(text) as { folder?: unknown; vaultDir?: unknown };
  // "vaultDir": config written by older versions.
  const folder = typeof parsed.folder === 'string' && parsed.folder ? parsed.folder : typeof parsed.vaultDir === 'string' ? parsed.vaultDir : '';
  if (!folder) throw new Error(`Invalid answeronce-mcp config at ${file}: "folder" is missing.`);
  return { folder };
}

export async function writeConfig(file: string, config: AnswerOnceMcpConfig): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
