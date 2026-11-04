import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addAgentConnector, hasAgentConnector } from '../../src/application/agent-connector';
import { writeConfig } from '../../mcp/src/config';
import { checkFolder, folderFromScriptPath, NOT_SET_UP, openFolder, resolveFolder, type FolderInputs } from '../../mcp/src/folder';
import { ProfileFolder } from '../../mcp/src/profile-folder';
import { MemoryVaultStorage } from '../../src/infrastructure/vault/memory-vault-storage';
import { diskFolder, tempDir } from '../helpers/vault';

function inputs(patch: Partial<FolderInputs> = {}): FolderInputs {
  return { env: {}, configPath: path.join(tempDir(), 'missing.json'), ...patch };
}

describe('answeronce-mcp folder resolution', () => {
  it('tries --folder, then ANSWERONCE_FOLDER, then the init config, then the script location', async () => {
    const configPath = path.join(tempDir(), 'config.json');
    await writeConfig(configPath, { folder: '/from/config' });
    const all: FolderInputs = { argument: '/from/arg', env: { ANSWERONCE_FOLDER: '/from/env' }, configPath, scriptPath: '/from/script/.answeronce/answeronce-mcp.js' };

    expect(await resolveFolder(all)).toEqual({ folder: '/from/arg', source: 'argument' });
    expect(await resolveFolder({ ...all, argument: undefined })).toEqual({ folder: '/from/env', source: 'env' });
    expect(await resolveFolder({ ...all, argument: undefined, env: {} })).toEqual({ folder: '/from/config', source: 'config' });
    expect(await resolveFolder({ ...all, argument: undefined, env: {}, configPath: path.join(tempDir(), 'none.json') })).toEqual({ folder: '/from/script', source: 'script' });
    expect(await resolveFolder(inputs({ scriptPath: '/somewhere/dist/answeronce-mcp.js' }))).toBeNull();
  });

  it('still accepts the legacy HIRE_FOLDER and the old config location as fallbacks', async () => {
    expect(await resolveFolder(inputs({ env: { HIRE_FOLDER: '/from/legacy-env' } }))).toEqual({ folder: '/from/legacy-env', source: 'env' });
    expect(await resolveFolder(inputs({ env: { ANSWERONCE_FOLDER: '/from/env', HIRE_FOLDER: '/from/legacy-env' } }))).toEqual({ folder: '/from/env', source: 'env' });

    const legacyConfigPath = path.join(tempDir(), 'hire', 'config.json');
    await writeConfig(legacyConfigPath, { folder: '/from/legacy-config' });
    expect(await resolveFolder(inputs({ legacyConfigPath }))).toEqual({ folder: '/from/legacy-config', source: 'config' });
    const configPath = path.join(tempDir(), 'config.json');
    await writeConfig(configPath, { folder: '/from/config' });
    expect(await resolveFolder(inputs({ configPath, legacyConfigPath }))).toEqual({ folder: '/from/config', source: 'config' });
  });

  it('ignores blank values and unsubstituted placeholders', async () => {
    const env = { ANSWERONCE_FOLDER: '${user_config.profile_folder}' };
    expect(await resolveFolder(inputs({ argument: '  ', env }))).toBeNull();
    expect(await resolveFolder(inputs({ env: { ANSWERONCE_FOLDER: ' /Users/ada/answeronce ' } }))).toEqual({ folder: '/Users/ada/answeronce', source: 'env' });
  });

  it('expands ~ and resolves relative paths', async () => {
    expect(await resolveFolder(inputs({ argument: '~/answeronce', env: { HOME: '/Users/ada' } }))).toEqual({ folder: '/Users/ada/answeronce', source: 'argument' });
    expect((await resolveFolder(inputs({ argument: 'answeronce' })))!.folder).toBe(path.resolve('answeronce'));
  });

  it('finds the folder only from <folder>/.answeronce/<script>', () => {
    expect(folderFromScriptPath('/Users/ada/My AnswerOnce/.answeronce/answeronce-mcp.js')).toBe('/Users/ada/My AnswerOnce');
    expect(folderFromScriptPath('/Users/ada/Library/Application Support/Claude/Claude Extensions/answeronce/server/answeronce-mcp.js')).toBeNull();
    expect(folderFromScriptPath('/Users/ada/answeronce/mcp/dist/answeronce-mcp.js')).toBeNull();
    expect(folderFromScriptPath(undefined)).toBeNull();
  });

  it('explains what to do when nothing is set or the folder is missing', async () => {
    await expect(openFolder(inputs())).rejects.toThrow(NOT_SET_UP);
    expect(NOT_SET_UP).toMatch(/Profile → AI agents/);
    const missing = path.join(tempDir(), 'gone');
    await expect(openFolder(inputs({ env: { ANSWERONCE_FOLDER: missing } }))).rejects.toThrow(/does not exist\. In Claude Desktop, open Settings → Extensions → AnswerOnce/);
    await expect(openFolder(inputs({ argument: missing }))).rejects.toThrow(/from the --folder option\) does not exist/);
  });

  it('turns a permission error into privacy settings instructions', async () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    const dir = tempDir();
    fs.chmodSync(dir, 0o000);
    try {
      await expect(checkFolder({ folder: dir, source: 'env' })).rejects.toThrow(/blocked access[\s\S]*Privacy & Security → Files and Folders/);
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });

  it('opens the profile folder that holds the connector written by the extension', async () => {
    const { dir } = await diskFolder();
    const folder = await openFolder(inputs({ scriptPath: path.join(dir, '.answeronce', 'answeronce-mcp.js') }));
    expect(folder.folder).toBe(dir);
    expect(await folder.info()).toMatchObject({ found: true, revision: 2 });
  });
});

describe('agent connector in the profile folder', () => {
  it('writes .answeronce/answeronce-mcp.js and replaces an older copy', async () => {
    const storage = new MemoryVaultStorage();
    expect(await hasAgentConnector(storage)).toBe(false);
    await addAgentConnector(storage, new TextEncoder().encode('v1'));
    await addAgentConnector(storage, new TextEncoder().encode('v2'));
    expect(new TextDecoder().decode((await storage.readBytes('.answeronce/answeronce-mcp.js'))!)).toBe('v2');
    expect(await hasAgentConnector(storage)).toBe(true);
    await expect(addAgentConnector(storage, new Uint8Array())).rejects.toThrow(/Reinstall the extension/);
  });

  it('is out of reach of agent tools', async () => {
    const { dir } = await diskFolder();
    const folder = new ProfileFolder(dir);
    await expect(folder.storage.writeText('.answeronce/answeronce-mcp.js', 'evil')).rejects.toThrow(/never accesses \.answeronce/);
    await expect(folder.storage.readText('.answeronce/answeronce-mcp.js')).rejects.toThrow(/never accesses \.answeronce/);
  });
});
