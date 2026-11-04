import { storagePath, type VaultStorage } from '../../ports/vault-storage';
import { utf8 } from '../../shared/encoding';

/** In-memory VaultStorage, used by tests. `files` holds every file as bytes, by name. */
export class MemoryVaultStorage implements VaultStorage {
  readonly files = new Map<string, Uint8Array>();

  /** Text content of a file, for assertions. */
  text(name: string): string | undefined {
    const bytes = this.files.get(name);
    return bytes ? utf8.decode(bytes) : undefined;
  }

  async readText(name: string): Promise<string | null> {
    storagePath(name);
    return this.text(name) ?? null;
  }
  async writeText(name: string, content: string): Promise<void> {
    storagePath(name);
    this.files.set(name, utf8.encode(content));
  }
  async readBytes(name: string): Promise<Uint8Array | null> {
    storagePath(name);
    const bytes = this.files.get(name);
    return bytes ? new Uint8Array(bytes) : null;
  }
  async writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    storagePath(name);
    this.files.set(name, new Uint8Array(bytes));
  }
  async remove(name: string): Promise<void> {
    this.files.delete(name);
  }
  async exists(name: string): Promise<boolean> {
    return this.files.has(name);
  }
}
