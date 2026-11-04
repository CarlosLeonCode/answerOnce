import { z } from 'zod';

/**
 * How AI agents connect to AnswerOnce through the local answeronce-mcp server.
 *
 * - Claude Desktop installs answeronce.mcpb (packaged with the extension) and asks
 *   for the profile folder itself: nothing to type.
 * - Claude Code, Codex, Antigravity, OpenCode and Cursor run answeronce-mcp.js, which the extension writes
 *   into the profile folder as .answeronce/answeronce-mcp.js. The script finds the folder
 *   from its own location, so the snippets only need the folder path.
 *
 * Pure functions: the options page fills the snippets from the folder path the
 * user pasted, falling back to placeholders for empty inputs.
 */

/**
 * Typed on the AI agents page. Kept in settings.json (`agentSetup`), never in
 * profile.json. Fields from older versions (`projectPath`) are dropped on read.
 */
export const AgentSetupSchema = z.object({
  /** Full path of the profile folder picked in the extension (the browser only knows its name). */
  profileFolder: z.string().default(''),
  /** Node executable: "node", or a full path for agents that do not see the shell PATH. */
  nodePath: z.string().default(''),
});
export type AgentSetup = z.infer<typeof AgentSetupSchema>;

export const PROFILE_PLACEHOLDER = '/path/to/profile-folder';
export const NODE_DEFAULT = 'node';
/** Hidden folder in the profile folder that holds the connector. */
export const CONNECTOR_DIR = '.answeronce';
/** The connector inside the profile folder, relative to it. */
export const CONNECTOR_SCRIPT_PATH = `${CONNECTOR_DIR}/answeronce-mcp.js`;
/** Packaged with the extension: the Claude Desktop extension and the server script. */
export const MCPB_ASSET = '/answeronce.mcpb';
export const CONNECTOR_ASSET = '/answeronce-mcp.js';
export const SERVER_NAME = 'answeronce';

export interface ResolvedAgentPaths {
  profile: string;
  node: string;
  /** Absolute path of the connector: <profile>/.answeronce/answeronce-mcp.js. */
  script: string;
}

/** A pasted path, cleaned: trimmed, without surrounding quotes or a trailing slash. */
export function cleanPath(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  return trimmed.length > 1 ? trimmed.replace(/(?<=[^\\/:])[\\/]+$/, '') : trimmed;
}

/** Cleaned inputs, with placeholders for the empty ones. `folderName` makes the profile placeholder concrete. */
export function resolveAgentPaths(setup: Partial<AgentSetup>, folderName?: string): ResolvedAgentPaths {
  const profile = cleanPath(setup.profileFolder) || (folderName ? `/path/to/${folderName}` : PROFILE_PLACEHOLDER);
  const node = cleanPath(setup.nodePath) || NODE_DEFAULT;
  return { profile, node, script: joinPath(profile, CONNECTOR_SCRIPT_PATH) };
}

/** Last segment of a POSIX or Windows path. */
export function baseName(p: string): string {
  return cleanPath(p).split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

/**
 * True when a pasted folder path visibly points to another folder than the one
 * picked in the extension (its last segment is not `folderName`).
 */
export function looksLikeOtherFolder(profileFolder: string, folderName: string | undefined): boolean {
  const cleaned = cleanPath(profileFolder);
  return Boolean(cleaned && folderName && baseName(cleaned) !== folderName);
}

/** Joins a relative POSIX path onto `base`, using backslashes when `base` is a Windows path. */
export function joinPath(base: string, relative: string): string {
  const windows = base.includes('\\') && !base.includes('/');
  const sep = windows ? '\\' : '/';
  const trimmed = base.replace(/[\\/]+$/, '');
  return `${trimmed}${sep}${windows ? relative.replaceAll('/', '\\') : relative}`;
}

const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Quotes one shell word (POSIX sh, bash, zsh). Safe words are left as they are;
 * anything else is single-quoted. A leading "~/" stays unquoted so the shell
 * still expands it to the home folder.
 */
export function shellQuote(value: string): string {
  if (value === '') return "''";
  const tilde = /^(~[A-Za-z0-9_.-]*)(\/.*)?$/.exec(value);
  if (tilde) {
    const rest = tilde[2] ?? '';
    if (rest === '' || SHELL_SAFE.test(rest)) return value;
    return `${tilde[1]}/${quoteWord(rest.slice(1))}`;
  }
  return SHELL_SAFE.test(value) ? value : quoteWord(value);
}

function quoteWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** A TOML basic string ("..."), escaped per the TOML spec. */
export function tomlString(value: string): string {
  const escaped = value.replace(/[\\"\u0000-\u001f\u007f]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\b':
        return '\\b';
      case '\t':
        return '\\t';
      case '\n':
        return '\\n';
      case '\f':
        return '\\f';
      case '\r':
        return '\\r';
      default:
        return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`;
    }
  });
  return `"${escaped}"`;
}

/** Claude Code: registers the server for every project of this user. */
export function claudeCodeCommand(paths: ResolvedAgentPaths): string {
  return `claude mcp add --transport stdio --scope user ${SERVER_NAME} -- ${shellQuote(paths.node)} ${shellQuote(paths.script)}`;
}

/** Codex: registers the server in ~/.codex/config.toml. */
export function codexCommand(paths: ResolvedAgentPaths): string {
  return `codex mcp add ${SERVER_NAME} -- ${shellQuote(paths.node)} ${shellQuote(paths.script)}`;
}

/** Codex: ~/.codex/config.toml. */
export function codexConfig(paths: ResolvedAgentPaths): string {
  return `[mcp_servers.${SERVER_NAME}]\ncommand = ${tomlString(paths.node)}\nargs = [${tomlString(paths.script)}]`;
}

/** Cursor: ~/.cursor/mcp.json. */
export function cursorConfig(paths: ResolvedAgentPaths): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'stdio', command: paths.node, args: [paths.script] } } }, null, 2);
}

/** Antigravity: registers the server in ~/.gemini/config/mcp_config.json. `--` keeps a command starting with "-" from reading as a flag. */
export function antigravityCommand(paths: ResolvedAgentPaths): string {
  return `agy mcp add ${SERVER_NAME} -- ${shellQuote(paths.node)} ${shellQuote(paths.script)}`;
}

/** Antigravity: ~/.gemini/config/mcp_config.json (global) or <workspace>/.agents/mcp_config.json. */
export function antigravityConfig(paths: ResolvedAgentPaths): string {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: paths.node, args: [paths.script] } } }, null, 2);
}

/** OpenCode: ~/.config/opencode/opencode.json (global) or opencode.json in the project root. */
export function opencodeConfig(paths: ResolvedAgentPaths): string {
  return JSON.stringify(
    { $schema: 'https://opencode.ai/config.json', mcp: { [SERVER_NAME]: { type: 'local', command: [paths.node, paths.script], enabled: true } } },
    null,
    2,
  );
}
