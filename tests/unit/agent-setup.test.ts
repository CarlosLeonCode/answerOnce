import { describe, expect, it } from 'vitest';
import {
  AgentSetupSchema,
  antigravityCommand,
  antigravityConfig,
  baseName,
  claudeCodeCommand,
  cleanPath,
  codexCommand,
  codexConfig,
  cursorConfig,
  joinPath,
  looksLikeOtherFolder,
  opencodeConfig,
  resolveAgentPaths,
  shellQuote,
  tomlString,
} from '../../src/domain/agent-setup';
import { SettingsSchema } from '../../src/domain/profile';

const plain = resolveAgentPaths({ profileFolder: '/Users/ada/answeronce-profile', nodePath: 'node' });
const spaced = resolveAgentPaths({ profileFolder: "/Users/ada/Ada's Profile", nodePath: '/Users/ada/.nvm/versions/node/v24.1.0/bin/node' });

describe('resolveAgentPaths', () => {
  it('falls back to placeholders for empty or blank inputs', () => {
    expect(resolveAgentPaths({})).toEqual({ profile: '/path/to/profile-folder', node: 'node', script: '/path/to/profile-folder/.answeronce/answeronce-mcp.js' });
    expect(resolveAgentPaths({ profileFolder: '  ', nodePath: ' ' }, 'answeronce-data')).toEqual({ profile: '/path/to/answeronce-data', node: 'node', script: '/path/to/answeronce-data/.answeronce/answeronce-mcp.js' });
  });

  it('points at the connector inside the profile folder, without doubling slashes', () => {
    expect(resolveAgentPaths({ profileFolder: ' /Users/ada/answeronce/ ' }).script).toBe('/Users/ada/answeronce/.answeronce/answeronce-mcp.js');
  });

  it('joins Windows paths with backslashes', () => {
    expect(joinPath('C:\\Users\\ada\\answeronce\\', '.answeronce/answeronce-mcp.js')).toBe('C:\\Users\\ada\\answeronce\\.answeronce\\answeronce-mcp.js');
    expect(resolveAgentPaths({ profileFolder: 'C:\\Users\\ada\\answeronce' }).script).toBe('C:\\Users\\ada\\answeronce\\.answeronce\\answeronce-mcp.js');
  });

  it('cleans pasted paths: quotes, spaces and trailing slashes', () => {
    expect(cleanPath(' "/Users/ada/My AnswerOnce/" ')).toBe('/Users/ada/My AnswerOnce');
    expect(cleanPath("'/Users/ada/answeronce'")).toBe('/Users/ada/answeronce');
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('C:\\')).toBe('C:\\');
    expect(cleanPath(undefined)).toBe('');
  });
});

describe('agentSetup in settings.json', () => {
  it('parses an empty object (old settings files) with defaults', () => {
    expect(AgentSetupSchema.parse({})).toEqual({ profileFolder: '', nodePath: '' });
  });

  it('drops the project path saved by older versions and keeps the rest', () => {
    const old = { ai: { provider: 'none' }, agentSetup: { projectPath: '/Users/ada/answeronce', profileFolder: '/Users/ada/AnswerOnce', nodePath: '/opt/node' } };
    expect(SettingsSchema.parse(old).agentSetup).toEqual({ profileFolder: '/Users/ada/AnswerOnce', nodePath: '/opt/node' });
  });
});

describe('looksLikeOtherFolder', () => {
  it('compares the last segment of the pasted path with the folder name', () => {
    expect(baseName('/Users/ada/AnswerOnce Profile/')).toBe('AnswerOnce Profile');
    expect(baseName('C:\\Users\\ada\\answeronce')).toBe('answeronce');
    expect(looksLikeOtherFolder('/Users/ada/answeronce', 'answeronce')).toBe(false);
    expect(looksLikeOtherFolder('/Users/ada/answeronce/', 'answeronce')).toBe(false);
    expect(looksLikeOtherFolder('/Users/ada/Documents', 'answeronce')).toBe(true);
    expect(looksLikeOtherFolder('', 'answeronce')).toBe(false);
    expect(looksLikeOtherFolder('/Users/ada/x', undefined)).toBe(false);
  });
});

describe('shellQuote', () => {
  it('leaves safe words alone', () => {
    expect(shellQuote('/Users/ada/answeronce')).toBe('/Users/ada/answeronce');
    expect(shellQuote('node')).toBe('node');
  });

  it('single-quotes spaces and special characters', () => {
    expect(shellQuote('/Users/ada/My Projects/answeronce')).toBe("'/Users/ada/My Projects/answeronce'");
    expect(shellQuote('/tmp/$HOME;rm -rf')).toBe("'/tmp/$HOME;rm -rf'");
    expect(shellQuote('')).toBe("''");
  });

  it('escapes single quotes', () => {
    expect(shellQuote("/Users/ada/Ada's Profile")).toBe("'/Users/ada/Ada'\\''s Profile'");
  });

  it('keeps a leading ~/ unquoted so the shell expands it', () => {
    expect(shellQuote('~/answeronce')).toBe('~/answeronce');
    expect(shellQuote('~/My Projects/answeronce')).toBe("~/'My Projects/answeronce'");
  });
});

describe('tomlString', () => {
  it('escapes backslashes, quotes and control characters', () => {
    expect(tomlString('C:\\Users\\ada\\answeronce')).toBe('"C:\\\\Users\\\\ada\\\\answeronce"');
    expect(tomlString('say "hi"')).toBe('"say \\"hi\\""');
    expect(tomlString('a\tb\nc\u0001')).toBe('"a\\tb\\nc\\u0001"');
  });
});

describe('snippets', () => {
  it('builds the Claude Code command', () => {
    expect(claudeCodeCommand(plain)).toBe('claude mcp add --transport stdio --scope user answeronce -- node /Users/ada/answeronce-profile/.answeronce/answeronce-mcp.js');
    expect(claudeCodeCommand(spaced)).toBe(
      "claude mcp add --transport stdio --scope user answeronce -- /Users/ada/.nvm/versions/node/v24.1.0/bin/node '/Users/ada/Ada'\\''s Profile/.answeronce/answeronce-mcp.js'",
    );
  });

  it('builds valid Cursor JSON', () => {
    expect(JSON.parse(cursorConfig(spaced))).toEqual({
      mcpServers: { answeronce: { type: 'stdio', command: '/Users/ada/.nvm/versions/node/v24.1.0/bin/node', args: ["/Users/ada/Ada's Profile/.answeronce/answeronce-mcp.js"] } },
    });
    const quoted = resolveAgentPaths({ profileFolder: 'C:\\Users\\ada\\"odd"\\answeronce' });
    expect(JSON.parse(cursorConfig(quoted))).toEqual({
      mcpServers: { answeronce: { type: 'stdio', command: 'node', args: ['C:\\Users\\ada\\"odd"\\answeronce\\.answeronce\\answeronce-mcp.js'] } },
    });
  });

  it('builds the Codex TOML table', () => {
    expect(codexConfig(plain)).toBe('[mcp_servers.answeronce]\ncommand = "node"\nargs = ["/Users/ada/answeronce-profile/.answeronce/answeronce-mcp.js"]');
    expect(codexConfig(resolveAgentPaths({ profileFolder: 'C:\\Users\\ada\\My "answeronce"' }))).toBe(
      '[mcp_servers.answeronce]\ncommand = "node"\nargs = ["C:\\\\Users\\\\ada\\\\My \\"answeronce\\"\\\\.answeronce\\\\answeronce-mcp.js"]',
    );
  });

  it('builds the Codex command', () => {
    expect(codexCommand(plain)).toBe('codex mcp add answeronce -- node /Users/ada/answeronce-profile/.answeronce/answeronce-mcp.js');
    expect(codexCommand(spaced)).toBe("codex mcp add answeronce -- /Users/ada/.nvm/versions/node/v24.1.0/bin/node '/Users/ada/Ada'\\''s Profile/.answeronce/answeronce-mcp.js'");
  });

  it('builds the Antigravity command, flags before the name and -- before the command', () => {
    expect(antigravityCommand(plain)).toBe('agy mcp add answeronce -- node /Users/ada/answeronce-profile/.answeronce/answeronce-mcp.js');
    expect(antigravityCommand(resolveAgentPaths({ profileFolder: '/Users/ada/My AnswerOnce', nodePath: '/opt/My Node/bin/node' }))).toBe(
      "agy mcp add answeronce -- '/opt/My Node/bin/node' '/Users/ada/My AnswerOnce/.answeronce/answeronce-mcp.js'",
    );
  });

  it('builds valid Antigravity JSON', () => {
    expect(JSON.parse(antigravityConfig(spaced))).toEqual({
      mcpServers: { answeronce: { command: '/Users/ada/.nvm/versions/node/v24.1.0/bin/node', args: ["/Users/ada/Ada's Profile/.answeronce/answeronce-mcp.js"] } },
    });
    expect(JSON.parse(antigravityConfig(resolveAgentPaths({ profileFolder: 'C:\\Users\\ada\\My "answeronce"' })))).toEqual({
      mcpServers: { answeronce: { command: 'node', args: ['C:\\Users\\ada\\My "answeronce"\\.answeronce\\answeronce-mcp.js'] } },
    });
  });

  it('builds valid OpenCode JSON with the command as one array', () => {
    expect(JSON.parse(opencodeConfig(spaced))).toEqual({
      $schema: 'https://opencode.ai/config.json',
      mcp: { answeronce: { type: 'local', command: ['/Users/ada/.nvm/versions/node/v24.1.0/bin/node', "/Users/ada/Ada's Profile/.answeronce/answeronce-mcp.js"], enabled: true } },
    });
  });

  it('uses placeholders when nothing was typed', () => {
    expect(claudeCodeCommand(resolveAgentPaths({}, 'answeronce'))).toBe('claude mcp add --transport stdio --scope user answeronce -- node /path/to/answeronce/.answeronce/answeronce-mcp.js');
  });
});
