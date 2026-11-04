import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { storagePath, type VaultStorage } from '../../ports/vault-storage';

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';

/**
 * VaultStorage backed by a directory on disk (Node), used by the answeronce-mcp
 * server. It reads and writes the very same files as the extension.
 * Writes are atomic: a private temp file in the same directory is fsynced,
 * then renamed over the target, so readers never see a partial file.
 */
export class NodeVaultStorage implements VaultStorage {
  constructor(readonly dir: string) {}

  private file(name: string): string {
    return path.join(this.dir, ...storagePath(name));
  }

  async readText(name: string): Promise<string | null> {
    try {
      return await fs.readFile(this.file(name), 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async readBytes(name: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(this.file(name)));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async write(name: string, content: string | Uint8Array): Promise<void> {
    const target = this.file(name);
    const parent = path.dirname(target);
    if (parent !== this.dir) await fs.mkdir(parent, { recursive: true, mode: 0o700 });
    const temp = path.join(parent, `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
    const handle = await fs.open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
  }

  writeText(name: string, content: string): Promise<void> {
    return this.write(name, content);
  }

  writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    return this.write(name, bytes);
  }

  async remove(name: string): Promise<void> {
    await fs.rm(this.file(name), { force: true });
  }

  async exists(name: string): Promise<boolean> {
    try {
      await fs.access(this.file(name));
      return true;
    } catch {
      return false;
    }
  }
}
