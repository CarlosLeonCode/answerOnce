import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createProfile, saveProfile, type VaultDeps } from '../../src/application/vault';
import { MemorySessionStore } from '../../src/infrastructure/session/memory-session-store';
import { MemoryVaultStorage } from '../../src/infrastructure/vault/memory-vault-storage';
import { NodeVaultStorage } from '../../src/infrastructure/vault/node-vault-storage';
import type { Profile } from '../../src/domain/profile';
import { sampleProfile } from './dom';

export type MemoryDeps = VaultDeps & { storage: MemoryVaultStorage; session: MemorySessionStore };

/** Extension-like deps (settings.json read and written) over in-memory files. */
export function memoryDeps(storage = new MemoryVaultStorage(), withSettings = true): MemoryDeps {
  return { storage, session: new MemorySessionStore(), withSettings };
}

/** A second writer on the same files, like answeronce-mcp (never touches settings.json). */
export function otherWriter(deps: MemoryDeps): MemoryDeps {
  return memoryDeps(deps.storage, false);
}

/** A profile folder in memory: created (rev 1), then `profile` saved (rev 2). */
export async function memoryFolder(profile: Profile = sampleProfile()): Promise<MemoryDeps> {
  const deps = memoryDeps();
  await createProfile(deps);
  await saveProfile(deps, profile);
  return deps;
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A new temp directory, deleted after the test file. */
export function tempDir(prefix = 'answeronce-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Creates a real profile folder (plain files on disk) in a new temp directory, as the extension does. */
export async function diskFolder(profile: Profile = sampleProfile()): Promise<{ dir: string; deps: VaultDeps }> {
  const dir = tempDir();
  const deps: VaultDeps = { storage: new NodeVaultStorage(dir), session: new MemorySessionStore(), withSettings: true };
  await createProfile(deps);
  await saveProfile(deps, profile);
  return { dir, deps };
}
