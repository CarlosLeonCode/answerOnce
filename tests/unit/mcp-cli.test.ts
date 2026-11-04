import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, type CliDeps } from '../../mcp/src/cli';
import { defaultConfigPath, legacyConfigPath, readConfig } from '../../mcp/src/config';
import { ProfileFolder } from '../../mcp/src/profile-folder';
import { diskFolder, tempDir } from '../helpers/vault';

function cli(configPath: string) {
  const out: string[] = [];
  const deps: CliDeps = {
    configPath,
    version: 'test',
    io: {
      out: (l) => out.push(l),
      err: (l) => out.push(`ERR ${l}`),
    },
  };
  return { deps, out, run: (...args: string[]) => runCli(args, deps) };
}

describe('answeronce-mcp CLI', () => {
  it('init stores only the folder path; status reads profile.json', async () => {
    const { dir } = await diskFolder();
    const configPath = path.join(tempDir(), 'config.json');
    const c = cli(configPath);

    expect(await c.run('status')).toBe(1);
    expect(c.out.at(-1)).toMatch(/Profile folder not set\. Use --folder <dir>, set ANSWERONCE_FOLDER, or run "answeronce-mcp init --folder <dir>"/);

    expect(await c.run('init', '--folder', dir)).toBe(0);
    expect(await readConfig(configPath)).toEqual({ folder: dir });
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ folder: dir });

    const { deps } = await new ProfileFolder(dir).open();
    expect((await deps.session.get())!.profile.personal.firstName).toBe('Ada');

    expect(await c.run('status')).toBe(0);
    expect(c.out.join('\n')).toMatch(/Revision: 2[\s\S]*Direct write: off[\s\S]*Pending proposals: 0/);
  });

  it('accepts --vault as an alias and reads configs written by older versions', async () => {
    const { dir } = await diskFolder();
    const configPath = path.join(tempDir(), 'config.json');
    const c = cli(configPath);
    expect(await c.run('init', `--vault=${dir}`)).toBe(0);
    expect(await readConfig(configPath)).toEqual({ folder: dir });

    fs.writeFileSync(configPath, JSON.stringify({ vaultDir: dir, keyAccount: 'vault-0123' }));
    expect(await readConfig(configPath)).toEqual({ folder: dir });
  });

  it('explains what is missing in an empty folder or one with old data', async () => {
    const dir = tempDir();
    const c = cli(path.join(tempDir(), 'config.json'));
    expect(await c.run('init', '--folder', dir)).toBe(0);
    expect(c.out.join('\n')).toMatch(/no profile.json there yet/);
    expect(await c.run('status')).toBe(1);

    fs.writeFileSync(path.join(dir, 'vault.enc'), '{}');
    expect(await c.run('status')).toBe(1);
    expect(c.out.at(-1)).toMatch(/older AnswerOnce version/);
    expect(await c.run('init', '--folder', path.join(dir, 'missing'))).toBe(1);
    expect(await c.run('unlock')).toBe(2);
  });

  it('status follows --folder / ANSWERONCE_FOLDER before the config', async () => {
    const { dir } = await diskFolder();
    const configPath = path.join(tempDir(), 'config.json');
    const c = cli(configPath);
    c.deps.folder = { env: { ANSWERONCE_FOLDER: dir }, configPath };
    expect(await c.run('status')).toBe(0);
    expect(c.out[0]).toBe(`Profile folder: ${dir} (from the ANSWERONCE_FOLDER setting)`);

    c.deps.folder = { argument: path.join(dir, 'missing'), env: {}, configPath };
    expect(await c.run('status')).toBe(1);
    expect(c.out.at(-1)).toMatch(/^ERR The AnswerOnce profile folder .* does not exist/);
  });

  it('uses the OS config location unless ANSWERONCE_MCP_CONFIG is set', () => {
    expect(defaultConfigPath({}, 'darwin', '/Users/ada')).toBe('/Users/ada/Library/Application Support/answeronce/config.json');
    expect(defaultConfigPath({}, 'linux', '/home/ada')).toBe('/home/ada/.config/answeronce/config.json');
    expect(defaultConfigPath({ XDG_CONFIG_HOME: '/xdg' }, 'linux', '/home/ada')).toBe('/xdg/answeronce/config.json');
    expect(defaultConfigPath({ ANSWERONCE_MCP_CONFIG: '/tmp/x.json' }, 'linux', '/home/ada')).toBe('/tmp/x.json');
    expect(defaultConfigPath({ HIRE_MCP_CONFIG: '/tmp/legacy.json' }, 'linux', '/home/ada')).toBe('/tmp/legacy.json');
  });

  it('falls back to the config folder of versions released as Hire, unless the path is overridden', () => {
    expect(legacyConfigPath({}, 'darwin', '/Users/ada')).toBe('/Users/ada/Library/Application Support/hire/config.json');
    expect(legacyConfigPath({}, 'linux', '/home/ada')).toBe('/home/ada/.config/hire/config.json');
    expect(legacyConfigPath({ ANSWERONCE_MCP_CONFIG: '/tmp/x.json' }, 'linux', '/home/ada')).toBeUndefined();
  });
});
