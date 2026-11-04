import { describe, expect, it } from 'vitest';
import { importLegacyVault, LEGACY_VAULT_FILE, MIGRATED_VAULT_FILE, WrongPassphraseError } from '../../src/application/legacy-migration';
import { inspectFolder, openProfile } from '../../src/application/vault';
import { PROFILE_FILE, SETTINGS_FILE } from '../../src/ports/vault-storage';
import { bytesToBase64, utf8 } from '../../src/shared/encoding';
import { sampleProfile } from '../helpers/dom';
import { memoryDeps, type MemoryDeps } from '../helpers/vault';

// Builds folders exactly like older AnswerOnce versions wrote them: vault.enc and
// one *.enc file per document, PBKDF2-SHA256 -> AES-GCM-256 JSON envelopes.

const PASSPHRASE = 'correct horse battery staple';
const ITERATIONS = 100_000; // the lowest count old versions accepted, to keep the test fast

async function legacyKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', utf8.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
}

async function encryptLegacy(key: CryptoKey, salt: Uint8Array, plain: Uint8Array<ArrayBuffer>, rev?: number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return JSON.stringify({
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS },
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    ...(rev === undefined ? {} : { rev }),
  });
}

const CV_BYTES = utf8.encode('%PDF-1.7 Ada Lovelace resume');
const PENDING_BYTES = utf8.encode('Pending CV from an agent');

async function legacyFolder(): Promise<MemoryDeps> {
  const deps = memoryDeps();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await legacyKey(PASSPHRASE, salt);
  const profile = sampleProfile();
  profile.documents = [
    { id: 'doc-cv-1234567890', kind: 'cv', fileName: 'Ada CV.pdf', mimeType: 'application/pdf', size: CV_BYTES.byteLength, storedAs: 'cv-doc-cv-1.pdf.enc', addedAt: '2026-01-01T00:00:00Z' },
    { id: 'doc-gone-12345678', kind: 'other', fileName: 'gone.txt', mimeType: 'text/plain', size: 1, storedAs: 'other-doc-gone.txt.enc', addedAt: '2026-01-01T00:00:00Z' },
  ];
  profile.defaultResumeId = 'doc-cv-1234567890';
  profile.ai = { provider: 'openai', model: 'gpt-x', apiKey: 'sk-SECRET-API-KEY', ollamaBaseUrl: 'http://localhost:11434' };
  profile.agentProposals = [
    {
      id: 'proposal-1',
      createdAt: '2026-02-01T00:00:00Z',
      client: 'Claude Code',
      summary: 'Import CV',
      source: 'cv-import',
      changes: {},
      pendingDocument: { id: 'doc-pending-1234', kind: 'cv', fileName: 'new.txt', mimeType: 'text/plain', size: PENDING_BYTES.byteLength, storedAs: 'cv-doc-pend.txt.enc', addedAt: '2026-02-01T00:00:00Z' },
    },
  ];
  await deps.storage.writeText(LEGACY_VAULT_FILE, await encryptLegacy(key, salt, utf8.encode(JSON.stringify(profile)), 7));
  await deps.storage.writeText('cv-doc-cv-1.pdf.enc', await encryptLegacy(key, salt, CV_BYTES));
  await deps.storage.writeText('cv-doc-pend.txt.enc', await encryptLegacy(key, salt, PENDING_BYTES));
  return deps;
}

describe('legacy encrypted vault import', () => {
  it('is detected when the folder has vault.enc and no profile.json', async () => {
    const deps = await legacyFolder();
    expect(await inspectFolder(deps.storage, LEGACY_VAULT_FILE)).toBe('legacy');
  });

  it('decrypts once and writes plain profile.json, settings.json and documents/', async () => {
    const deps = await legacyFolder();
    const { session, missingDocuments } = await importLegacyVault(deps, PASSPHRASE);

    expect(missingDocuments).toEqual(['gone.txt']);
    expect(session.revision).toBe(1);
    expect(session.profile.personal.email).toBe('ada@example.com');

    const profileJson = JSON.parse(deps.storage.text(PROFILE_FILE)!) as Record<string, unknown>;
    expect(profileJson).toMatchObject({ rev: 1, personal: { firstName: 'Ada', email: 'ada@example.com' }, defaultResumeId: 'doc-cv-1234567890' });
    expect(profileJson).not.toHaveProperty('ai');
    expect(JSON.parse(deps.storage.text(SETTINGS_FILE)!)).toEqual({
      ai: expect.objectContaining({ provider: 'openai', apiKey: 'sk-SECRET-API-KEY' }),
      agentSetup: { profileFolder: '', nodePath: '' },
    });

    const [cv] = session.profile.documents;
    expect(session.profile.documents).toHaveLength(1);
    expect(cv).toMatchObject({ id: 'doc-cv-1234567890', fileName: 'Ada CV.pdf', storedAs: 'documents/Ada-CV-doc-cv-1.pdf' });
    expect(deps.storage.text(cv!.storedAs)).toBe('%PDF-1.7 Ada Lovelace resume');
    const pending = session.profile.agentProposals[0]!.pendingDocument!;
    expect(pending.storedAs).toBe('documents/new-doc-pend.txt');
    expect(deps.storage.text(pending.storedAs)).toBe('Pending CV from an agent');

    // The old files are retired: vault.enc renamed, encrypted documents deleted.
    expect([...deps.storage.files.keys()].sort()).toEqual([
      'documents/Ada-CV-doc-cv-1.pdf',
      'documents/new-doc-pend.txt',
      PROFILE_FILE,
      SETTINGS_FILE,
      MIGRATED_VAULT_FILE,
    ]);
    expect(await inspectFolder(deps.storage, LEGACY_VAULT_FILE)).toBe('profile');

    // A fresh session reads the plain files without any passphrase.
    await deps.session.clear();
    const reopened = await openProfile(deps);
    expect(reopened.profile).toMatchObject({ personal: { lastName: 'Lovelace' }, ai: { apiKey: 'sk-SECRET-API-KEY' } });
  });

  it('a wrong passphrase changes nothing', async () => {
    const deps = await legacyFolder();
    const before = [...deps.storage.files.keys()].sort();
    await expect(importLegacyVault(deps, 'not the passphrase')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect([...deps.storage.files.keys()].sort()).toEqual(before);
    expect(await deps.session.get()).toBeNull();
  });

  it('refuses when a profile.json already exists or the file is not an old vault', async () => {
    const deps = await legacyFolder();
    await deps.storage.writeText(PROFILE_FILE, '{}');
    await expect(importLegacyVault(deps, PASSPHRASE)).rejects.toThrow(/already contains a profile.json/);
    expect(deps.storage.files.has(LEGACY_VAULT_FILE)).toBe(true);

    const other = memoryDeps();
    await other.storage.writeText(LEGACY_VAULT_FILE, '{"hello":"world"}');
    await expect(importLegacyVault(other, PASSPHRASE)).rejects.toThrow(/not an encrypted file from an older AnswerOnce version/);
  });
});
