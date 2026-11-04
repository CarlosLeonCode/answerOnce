import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMcp } from '../../mcp/build.ts';
import { writeConfig } from '../../mcp/src/config';
import { openProfile } from '../../src/application/vault';
import type { Profile } from '../../src/domain/profile';
import { sampleProfile } from '../helpers/dom';
import { resultJson, resultText } from '../helpers/mcp';
import { diskFolder, tempDir } from '../helpers/vault';

// Spawns the bundled production server over stdio, like Claude Code / Codex /
// Cursor do, against a temp profile folder created with the application code.

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

let workDir: string;
let bundle: string;

beforeAll(async () => {
  workDir = tempDir('answeronce-mcp-it-');
  bundle = await buildMcp({ outfile: path.join(workDir, 'answeronce-mcp.js') });
}, 60_000);

afterAll(() => fs.rmSync(workDir, { recursive: true, force: true }));

async function connect(configPath: string, options: { script?: string; env?: Record<string, string> } = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [options.script ?? bundle, '--config', configPath],
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...options.env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'claude-code', version: '9.9.9' });
  await client.connect(transport);
  return client;
}

function profileWithApiKey(): Profile {
  const p = sampleProfile();
  p.ai = { provider: 'claude', model: 'claude-x', apiKey: 'sk-ant-SECRET', ollamaBaseUrl: 'http://localhost:11434' };
  return p;
}

describe('answeronce-mcp over stdio', () => {
  it('reads, proposes and imports CVs on the plain files of the profile folder', async () => {
    const { dir, deps } = await diskFolder(profileWithApiKey());
    const settings = fs.readFileSync(path.join(dir, 'settings.json'), 'utf8');
    const configPath = path.join(workDir, 'config.json');
    await writeConfig(configPath, { folder: dir });
    const client = await connect(configPath);

    try {
      expect((await client.listTools()).tools).toHaveLength(15);
      expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(['import_cv']);

      const profile = resultJson(await client.callTool({ name: 'get_profile', arguments: { sections: ['personal'] } }));
      expect(profile).toMatchObject({ revision: 2, personal: { firstName: 'Ada', lastName: 'Lovelace' } });

      const update = resultJson(await client.callTool({ name: 'propose_profile_update', arguments: { description: 'New headline', headline: 'Analyst of Engines' } }));
      expect(update).toMatchObject({ status: 'proposed', pendingChanges: 1 });

      const pdf = resultJson<{ proposalId: string; text: string }>(await client.callTool({ name: 'import_cv_file', arguments: { path: path.join(FIXTURES, 'sample-cv.pdf') } }));
      expect(pdf.text).toContain('Lumen Analytics');
      const docx = await client.callTool({ name: 'import_cv_file', arguments: { path: path.join(FIXTURES, 'sample-cv.docx') } });
      expect(resultText(docx)).toContain('jordan.rivera@example.com');

      const status = resultJson(await client.callTool({ name: 'vault_status', arguments: {} }));
      expect(status).toEqual({ folder: dir, profileFound: true, revision: 5, directWrite: false, pendingProposals: 3 });

      // Nothing any tool returned contains the AI settings.
      const everything = resultText(await client.callTool({ name: 'get_profile', arguments: { sections: ['personal', 'links', 'about', 'workAuthorization', 'preferences', 'experience', 'education', 'savedAnswers'] } }));
      for (const secret of ['sk-ant-SECRET', 'claude-x']) expect(everything).not.toContain(secret);
    } finally {
      await client.close();
    }

    // On disk: readable profile.json, untouched settings.json, real document files.
    expect(fs.readdirSync(dir).sort()).toEqual(['documents', 'profile.json', 'settings.json']);
    const documents = fs.readdirSync(path.join(dir, 'documents')).sort((x, y) => path.extname(x).localeCompare(path.extname(y)));
    expect(documents).toEqual([expect.stringMatching(/^sample-cv-[0-9a-f]{8}\.docx$/), expect.stringMatching(/^sample-cv-[0-9a-f]{8}\.pdf$/)]);
    for (const name of documents) {
      expect(fs.readFileSync(path.join(dir, 'documents', name))).toEqual(fs.readFileSync(path.join(FIXTURES, `sample-cv${path.extname(name)}`)));
    }
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).toBe(settings);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8')) as Record<string, unknown>;
    expect(onDisk).toMatchObject({ rev: 5, personal: { firstName: 'Ada' } });
    expect(onDisk).not.toHaveProperty('ai');

    // The extension sees the pending proposals and keeps its AI settings.
    const { profile } = await openProfile(deps);
    expect(profile.headline).toBe('');
    expect(profile.ai.apiKey).toBe('sk-ant-SECRET');
    expect(profile.agentProposals.map((p) => [p.client, p.source, p.pendingDocument?.fileName ?? null])).toEqual([
      ['Claude Code', 'update', null],
      ['Claude Code', 'cv-import', 'sample-cv.pdf'],
      ['Claude Code', 'cv-import', 'sample-cv.docx'],
    ]);
  });

  it('answers with a clear error when answeronce-mcp is not set up', async () => {
    const client = await connect(path.join(workDir, 'missing-config.json'));
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).toContain('propose_profile_update');
      const result = await client.callTool({ name: 'get_profile', arguments: { sections: ['personal'] } });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toMatch(/does not know where the AnswerOnce profile folder is[\s\S]*Profile → AI agents/);
    } finally {
      await client.close();
    }
  });

  it('finds the folder without init: ANSWERONCE_FOLDER (Claude Desktop) or the connector inside the folder', async () => {
    const missingConfig = path.join(workDir, 'missing-config.json');
    const fromEnv = await diskFolder();
    let client = await connect(missingConfig, { env: { ANSWERONCE_FOLDER: fromEnv.dir } });
    try {
      expect(resultJson(await client.callTool({ name: 'vault_status', arguments: {} }))).toMatchObject({ folder: fromEnv.dir, profileFound: true, revision: 2 });
    } finally {
      await client.close();
    }

    // Written by the extension's "Add the connector to your profile folder".
    const fromScript = await diskFolder();
    const script = path.join(fromScript.dir, '.answeronce', 'answeronce-mcp.js');
    fs.mkdirSync(path.dirname(script));
    fs.copyFileSync(bundle, script);
    client = await connect(missingConfig, { script });
    try {
      expect(resultJson(await client.callTool({ name: 'vault_status', arguments: {} }))).toMatchObject({ folder: fromScript.dir, profileFound: true, revision: 2 });
    } finally {
      await client.close();
    }
  });
});
