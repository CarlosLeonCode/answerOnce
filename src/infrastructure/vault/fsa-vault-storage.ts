import { storagePath, type VaultStorage } from '../../ports/vault-storage';

const isNotFound = (error: unknown) => error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

/** VaultStorage backed by a user-picked directory (File System Access API). */
export class FsaVaultStorage implements VaultStorage {
  constructor(private readonly dir: FileSystemDirectoryHandle) {}

  private async fileHandle(name: string, create: boolean): Promise<FileSystemFileHandle> {
    const segments = storagePath(name);
    const fileName = segments.pop()!;
    let dir = this.dir;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create });
    return dir.getFileHandle(fileName, { create });
  }

  private async read(name: string): Promise<File | null> {
    try {
      return await (await this.fileHandle(name, false)).getFile();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readText(name: string): Promise<string | null> {
    return (await (await this.read(name))?.text()) ?? null;
  }

  async readBytes(name: string): Promise<Uint8Array | null> {
    const file = await this.read(name);
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
  }

  private async write(name: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> {
    const handle = await this.fileHandle(name, true);
    // createWritable writes to a swap file and atomically replaces on close().
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  writeText(name: string, content: string): Promise<void> {
    return this.write(name, content);
  }

  writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    return this.write(name, new Uint8Array(bytes));
  }

  async remove(name: string): Promise<void> {
    const segments = storagePath(name);
    const fileName = segments.pop()!;
    try {
      let dir = this.dir;
      for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
      await dir.removeEntry(fileName);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
  }

  async exists(name: string): Promise<boolean> {
    storagePath(name);
    try {
      await this.fileHandle(name, false);
      return true;
    } catch {
      return false;
    }
  }
}
