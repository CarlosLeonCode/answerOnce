import type { Page } from '@playwright/test';
import { submitChanges, type SubmitInput, type SubmitOutcome } from '../../src/application/agent-proposals';
import { openProfile, type VaultDeps } from '../../src/application/vault';
import { MemorySessionStore } from '../../src/infrastructure/session/memory-session-store';
import { storagePath, type VaultStorage } from '../../src/ports/vault-storage';

/**
 * VaultStorage over the extension's OPFS test folder (the "answeronce" directory),
 * driven from Node through an extension page. Lets a test write to the folder
 * exactly like answeronce-mcp writes to the real directory on disk.
 * Bytes cross the bridge as plain number arrays.
 */
class OpfsBridgeStorage implements VaultStorage {
  constructor(private readonly page: Page) {}

  async readBytes(name: string): Promise<Uint8Array | null> {
    const bytes = await this.page.evaluate(async (segments) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce');
        for (const s of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(s);
        const file = await (await dir.getFileHandle(segments.at(-1)!)).getFile();
        return [...new Uint8Array(await file.arrayBuffer())];
      } catch {
        return null;
      }
    }, storagePath(name));
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBytes(name: string, bytes: Uint8Array): Promise<void> {
    await this.page.evaluate(
      async ({ segments, data }) => {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce');
        for (const s of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(s, { create: true });
        const writable = await (await dir.getFileHandle(segments.at(-1)!, { create: true })).createWritable();
        await writable.write(new Uint8Array(data));
        await writable.close();
      },
      { segments: storagePath(name), data: [...bytes] },
    );
  }

  async readText(name: string): Promise<string | null> {
    const bytes = await this.readBytes(name);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }

  writeText(name: string, content: string): Promise<void> {
    return this.writeBytes(name, new TextEncoder().encode(content));
  }

  async remove(name: string): Promise<void> {
    await this.page.evaluate(async (segments) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce');
      for (const s of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(s);
      await dir.removeEntry(segments.at(-1)!).catch(() => undefined);
    }, storagePath(name));
  }

  async exists(name: string): Promise<boolean> {
    return (await this.readBytes(name)) !== null;
  }
}

/**
 * Simulates an AI agent connected through answeronce-mcp: the shared application
 * code reading and writing profile.json, never settings.json.
 */
export class SimulatedAgent {
  private constructor(private readonly deps: VaultDeps) {}

  static async connect(page: Page): Promise<SimulatedAgent> {
    const deps: VaultDeps = { storage: new OpfsBridgeStorage(page), session: new MemorySessionStore(), withSettings: false };
    await openProfile(deps);
    return new SimulatedAgent(deps);
  }

  /** What every answeronce-mcp write tool does: re-read profile.json, then propose (or apply). */
  async submit(input: Omit<SubmitInput, 'client'> & { client?: string }): Promise<SubmitOutcome> {
    const reload = () => openProfile(this.deps);
    await reload();
    return submitChanges(this.deps, { client: 'Claude Code', ...input }, reload);
  }
}

/** The options page re-checks the profile revision when the window gets focus. */
export async function focusPage(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
