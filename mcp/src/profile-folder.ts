import type { ApplicationsDeps } from '../../src/application/applications';
import { hasLegacyVault } from '../../src/application/legacy-migration';
import { openProfile, parseProfileFile, VaultError, type VaultDeps } from '../../src/application/vault';
import { MemorySessionStore } from '../../src/infrastructure/session/memory-session-store';
import { NodeVaultStorage } from '../../src/infrastructure/vault/node-vault-storage';
import { CONNECTOR_DIR, PROFILE_FILE, SETTINGS_FILE, type VaultStorage } from '../../src/ports/vault-storage';

/**
 * The folder storage as answeronce-mcp sees it: settings.json (AI provider settings
 * and API keys) can be neither read nor written, as a second guard behind
 * `withSettings: false`. Neither can the connector folder (.answeronce/), so no tool
 * can change the script that agents run.
 */
class AgentStorage implements VaultStorage {
  constructor(private readonly inner: VaultStorage) {}

  private check(name: string): string {
    if (name === SETTINGS_FILE) throw new VaultError(`answeronce-mcp never accesses ${SETTINGS_FILE}.`);
    if (name.startsWith(`${CONNECTOR_DIR}/`)) throw new VaultError(`answeronce-mcp never accesses ${CONNECTOR_DIR}/.`);
    return name;
  }

  async readText(name: string) {
    return this.inner.readText(this.check(name));
  }
  async writeText(name: string, content: string) {
    return this.inner.writeText(this.check(name), content);
  }
  async readBytes(name: string) {
    return this.inner.readBytes(this.check(name));
  }
  async writeBytes(name: string, bytes: Uint8Array) {
    return this.inner.writeBytes(this.check(name), bytes);
  }
  async remove(name: string) {
    return this.inner.remove(this.check(name));
  }
  async exists(name: string) {
    return this.inner.exists(this.check(name));
  }
}

export interface FolderInfo {
  folder: string;
  /** profile.json exists. */
  found: boolean;
  /** Only data from an older AnswerOnce version: the user must import it in the extension first. */
  legacy: boolean;
  revision: number | null;
}

/** The profile folder as seen by answeronce-mcp: the same files as the extension, minus settings.json. */
export class ProfileFolder {
  readonly storage: VaultStorage;

  constructor(readonly folder: string) {
    this.storage = new AgentStorage(new NodeVaultStorage(folder));
  }

  async info(): Promise<FolderInfo> {
    const text = await this.storage.readText(PROFILE_FILE).catch(() => null);
    if (text === null) return { folder: this.folder, found: false, legacy: await hasLegacyVault(this.storage).catch(() => false), revision: null };
    return { folder: this.folder, found: true, legacy: false, revision: parseProfileFile(text).revision };
  }

  /** Fresh dependencies with an empty, in-memory session. Never touch settings.json. */
  deps(): VaultDeps {
    return { storage: this.storage, session: new MemorySessionStore(), withSettings: false };
  }

  /**
   * Reads profile.json for one request: the returned deps hold an in-memory
   * session; `reload` re-reads it from disk.
   */
  async open(): Promise<{ deps: VaultDeps; reload: () => Promise<void> }> {
    await this.ensureProfile();
    const deps = this.deps();
    const reload = async () => void (await openProfile(deps));
    await reload();
    return { deps, reload };
  }

  /**
   * Access to applications.json (the jobs the user applied to). It lives next
   * to profile.json and is only used in a folder set up by the extension.
   */
  async applications(): Promise<ApplicationsDeps> {
    await this.ensureProfile();
    return { storage: this.storage };
  }

  private async ensureProfile(): Promise<void> {
    if (!(await this.storage.exists(PROFILE_FILE))) {
      const legacy = await hasLegacyVault(this.storage).catch(() => false);
      throw new VaultError(
        legacy
          ? `The folder ${this.folder} has data from an older AnswerOnce version that was not imported yet. Ask the user to open the AnswerOnce extension and import it.`
          : `No AnswerOnce profile (${PROFILE_FILE}) in ${this.folder}. Ask the user to check that this is the folder they chose in the AnswerOnce extension, or to create the profile there first.`,
      );
    }
  }
}
