import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeVaultStorage } from '../../src/infrastructure/vault/node-vault-storage';
import { tempDir } from '../helpers/vault';

describe('NodeVaultStorage', () => {
  it('reads, writes atomically (no temp files left), removes and checks files', async () => {
    const dir = tempDir();
    const storage = new NodeVaultStorage(dir);
    expect(await storage.readText('profile.json')).toBeNull();
    expect(await storage.exists('profile.json')).toBe(false);
    await storage.writeText('profile.json', '{"rev":1}');
    await storage.writeText('profile.json', '{"rev":2}');
    expect(await storage.readText('profile.json')).toBe('{"rev":2}');
    expect(fs.readdirSync(dir)).toEqual(['profile.json']);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'profile.json')).mode & 0o777).toBe(0o600);
    await storage.remove('profile.json');
    await storage.remove('profile.json');
    expect(await storage.exists('profile.json')).toBe(false);
  });

  it('writes binary documents into a subfolder', async () => {
    const dir = tempDir();
    const storage = new NodeVaultStorage(dir);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    expect(await storage.readBytes('documents/cv.pdf')).toBeNull();
    await storage.writeBytes('documents/cv.pdf', bytes);
    expect(await storage.readBytes('documents/cv.pdf')).toEqual(bytes);
    expect(fs.readdirSync(path.join(dir, 'documents'))).toEqual(['cv.pdf']);
  });

  it('refuses names that could escape the folder', async () => {
    const storage = new NodeVaultStorage(tempDir());
    for (const name of ['../x', '.hidden', 'a/b/c', 'documents/../x', '/etc/passwd', '', '.answeronce', '.other/x', 'documents/.answeronce', '.answeronce/.x', '.answeronce/a/b']) {
      await expect(storage.writeText(name, 'x')).rejects.toThrow(/Invalid file name/);
    }
  });

  it('allows the hidden connector folder, and only that one', async () => {
    const dir = tempDir();
    const storage = new NodeVaultStorage(dir);
    await storage.writeText('.answeronce/answeronce-mcp.js', 'console.log(1)');
    expect(fs.readFileSync(path.join(dir, '.answeronce', 'answeronce-mcp.js'), 'utf8')).toBe('console.log(1)');
  });
});
