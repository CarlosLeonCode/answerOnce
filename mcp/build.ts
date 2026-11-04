// Bundles answeronce-mcp into one runnable ESM file and packs it as a Claude Desktop
// extension (MCP Bundle): node mcp/build.ts
//   mcp/dist/answeronce-mcp.js   the server (also what Claude Code, Codex, Antigravity, OpenCode and Cursor run)
//   mcp/dist/answeronce.mcpb     the same server + manifest.json + icon, for Claude Desktop
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');

export const MCP_ENTRY = path.join(ROOT, 'mcp/src/main.ts');
export const MCP_OUTFILE = path.join(ROOT, 'mcp/dist/answeronce-mcp.js');
export const MCPB_OUTFILE = path.join(ROOT, 'mcp/dist/answeronce.mcpb');
const MCPB_STAGE = path.join(ROOT, 'mcp/dist/mcpb');
const ICON = path.join(ROOT, 'public/icon/512.png');

/**
 * Oldest Node the bundle supports. The server itself needs Node 20 (MCP SDK:
 * 18+), but pdf.js 6 (PDF import) declares Node 22.13+. Claude Desktop runs
 * extensions on the Node.js it ships with.
 */
export const NODE_TARGET = 'node22.13';
export const NODE_RANGE = '>=22.13.0';

const packageJson = () => JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };

/** Bundles `entry` (default: the answeronce-mcp CLI) into a single executable ESM file. */
export async function buildMcp(options: { entry?: string; outfile?: string; banner?: string } = {}): Promise<string> {
  const outfile = options.outfile ?? MCP_OUTFILE;
  await build({
    entryPoints: [options.entry ?? MCP_ENTRY],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: NODE_TARGET,
    logLevel: 'warning',
    legalComments: 'none',
    // Shipped twice inside the browser extension (answeronce-mcp.js and answeronce.mcpb): halves its size.
    minify: true,
    keepNames: true,
    define: { __ANSWERONCE_MCP_VERSION__: JSON.stringify(packageJson().version) },
    // CommonJS dependencies (mammoth) call require() for Node built-ins.
    banner: {
      js: [
        '#!/usr/bin/env node',
        "import { createRequire as __answeronceCreateRequire } from 'node:module';",
        'const require = __answeronceCreateRequire(import.meta.url);',
        options.banner ?? '',
      ].join('\n'),
    },
  });
  chmodSync(outfile, 0o755);
  return outfile;
}

/** Tool names and one-line descriptions, read from the built server itself so the manifest never drifts. */
async function listTools(server: string): Promise<{ name: string; description: string }[]> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }, stderr: 'ignore' });
  const client = new Client({ name: 'answeronce-build', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({ name: t.name, description: /^.*?[.!?](?=\s|$)/.exec(t.description ?? '')?.[0] ?? t.description ?? '' }));
  } finally {
    await client.close();
  }
}

/** manifest.json of the MCP Bundle. Spec: https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md */
export function mcpbManifest(version: string, tools: { name: string; description: string }[]) {
  return {
    // 0.2: the CLI's default and the version every Claude Desktop with extensions accepts (0.3 is marked WIP in the CLI).
    manifest_version: '0.2',
    name: 'answeronce',
    display_name: 'AnswerOnce',
    version,
    description: 'Read and update your AnswerOnce job application profile. Changes wait for your review in the AnswerOnce browser extension.',
    long_description:
      'AnswerOnce keeps your job application profile as plain files in a folder on your computer. This extension lets Claude read the parts of your profile a task needs, import your CV, save answers to application questions, propose profile changes and look up the jobs you applied to. Profile changes are proposals: you accept or reject them in the AnswerOnce browser extension, unless you turn on direct write there. It never reads settings.json (your AI provider settings and API keys). Whatever Claude reads is sent to Anthropic, like anything else you share with Claude.',
    author: { name: 'AnswerOnce' },
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/answeronce-mcp.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/answeronce-mcp.js'],
        env: { ANSWERONCE_FOLDER: '${user_config.profile_folder}' },
      },
    },
    tools,
    keywords: ['jobs', 'job applications', 'resume', 'cv', 'profile'],
    compatibility: {
      platforms: ['darwin', 'win32', 'linux'],
      runtimes: { node: NODE_RANGE },
    },
    user_config: {
      profile_folder: {
        type: 'directory',
        title: 'AnswerOnce profile folder',
        description: 'The folder you chose in the AnswerOnce extension (it has profile.json in it).',
        required: true,
      },
    },
  };
}

function mcpbCli(...args: string[]): string {
  const cli = path.join(path.dirname(createRequire(import.meta.url).resolve('@anthropic-ai/mcpb')), 'cli/cli.js');
  try {
    return execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    throw new Error(`mcpb ${args[0]} failed:\n${stdout ?? ''}${stderr ?? ''}`);
  }
}

/** Packs the built server into answeronce.mcpb (validated with the official mcpb CLI). */
export async function buildMcpb(options: { server?: string; outfile?: string } = {}): Promise<string> {
  const server = options.server ?? MCP_OUTFILE;
  const outfile = options.outfile ?? MCPB_OUTFILE;
  rmSync(MCPB_STAGE, { recursive: true, force: true });
  mkdirSync(path.join(MCPB_STAGE, 'server'), { recursive: true });
  copyFileSync(server, path.join(MCPB_STAGE, 'server/answeronce-mcp.js'));
  copyFileSync(ICON, path.join(MCPB_STAGE, 'icon.png'));
  const manifest = mcpbManifest(packageJson().version, await listTools(server));
  writeFileSync(path.join(MCPB_STAGE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  mcpbCli('validate', path.join(MCPB_STAGE, 'manifest.json'));
  rmSync(outfile, { force: true });
  mcpbCli('pack', MCPB_STAGE, outfile);
  return outfile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await buildMcp();
  console.log(`Built ${path.relative(process.cwd(), server)}`);
  const bundle = await buildMcpb({ server });
  console.log(`Built ${path.relative(process.cwd(), bundle)}`);
}
