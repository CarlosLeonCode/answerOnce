import { webcrypto } from 'node:crypto';
import { expect, test } from './support/fixtures';
import { ADA, ADA_SECRETS } from './support/profile';

// The profile is a set of plain files in a folder the user picks (an OPFS
// folder in these tests). Browser storage holds no personal data; only the
// memory-only chrome.storage.session caches the loaded profile.

test('profile.json is plain, readable JSON in the folder; AI settings live in settings.json', async ({ answeronce }) => {
  await answeronce.setUpFolderWithProfile();

  const files = await answeronce.folderFiles();
  expect(files.map((f) => f.name)).toEqual(['profile.json', 'settings.json']);
  const [profileFile, settingsFile] = files;
  // Pretty-printed, so a person can read and edit it.
  expect(profileFile!.text).toMatch(/^\{\n {2}"rev": \d+,\n/);
  const profile = JSON.parse(profileFile!.text) as Record<string, unknown>;
  expect(profile).toMatchObject({
    rev: (await answeronce.session())!.revision,
    personal: { firstName: ADA.firstName, lastName: ADA.lastName, email: ADA.email, phone: ADA.phone, city: ADA.city },
    links: { linkedin: ADA.linkedin },
    experience: [expect.objectContaining({ title: ADA.title, company: ADA.company, current: true })],
    preferences: expect.objectContaining({ expectedSalary: ADA.expectedSalary }),
    agentProposals: [],
    agents: { directWrite: false },
  });
  expect(profile).not.toHaveProperty('ai');
  expect(Object.keys(JSON.parse(settingsFile!.text) as object)).toEqual(['ai', 'agentSetup']);
  for (const secret of ADA_SECRETS) expect(settingsFile!.text).not.toContain(secret);
});

test('chrome.storage.local and IndexedDB hold no personal data; the session caches the profile', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();

  // chrome.storage.local: nothing personal (nothing at all today).
  const local = JSON.stringify(await answeronce.localStorage());
  for (const secret of ADA_SECRETS) expect(local).not.toContain(secret);

  // IndexedDB: only the folder handle.
  expect(await answeronce.indexedDbRecords(options)).toEqual([{ db: 'hire', store: 'handles', key: 'vault-directory', type: 'FileSystemDirectoryHandle' }]);

  // chrome.storage.session (memory only): the loaded profile and its revision.
  const session = await answeronce.session();
  expect(session).not.toBeNull();
  expect(Object.keys(session!).sort()).toEqual(['loadedAt', 'profile', 'revision']);
  expect(session!.profile.personal).toMatchObject({ firstName: ADA.firstName, lastName: ADA.lastName, email: ADA.email, phone: ADA.phone });
});

test('a new browser session loads the profile from the folder again', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  await answeronce.clearSession();
  await options.reload();
  const sidebar = options.getByRole('complementary', { name: 'Main navigation' });
  await expect(sidebar.getByText(`${ADA.firstName} ${ADA.lastName}`)).toBeVisible({ timeout: 30_000 });
  expect((await answeronce.session())?.profile.personal.email).toBe(ADA.email);
});

// --- Data written by older versions (one encrypted vault.enc) -------------

const OLD_PASSPHRASE = 'correct horse battery staple';

/** A vault.enc exactly as older AnswerOnce versions wrote it. */
async function oldVaultFile(profile: unknown): Promise<string> {
  const { subtle } = webcrypto;
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const iterations = 100_000;
  const material = await subtle.importKey('raw', new TextEncoder().encode(OLD_PASSPHRASE), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(profile)));
  const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64');
  return JSON.stringify({ v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext), rev: 4 });
}

test('data from an older version is imported once with its passphrase and becomes plain files', async ({ answeronce }) => {
  await answeronce.writeFolderFile(
    'vault.enc',
    await oldVaultFile({ schemaVersion: 3, personal: { firstName: ADA.firstName, lastName: ADA.lastName, email: ADA.email }, ai: { provider: 'ollama', model: 'llama3.2' } }),
  );
  const options = await answeronce.context.newPage();
  await options.goto(answeronce.url('options.html'));
  await options.getByRole('button', { name: 'Choose folder…' }).click();
  await expect(options.getByRole('heading', { name: 'Import your old encrypted data' })).toBeVisible();

  await options.getByLabel('Passphrase').fill('not the right passphrase');
  await options.getByRole('button', { name: 'Import my data' }).click();
  await expect(options.getByRole('alert')).toContainText('Wrong passphrase', { timeout: 30_000 });
  expect((await answeronce.folderFiles()).map((f) => f.name)).toEqual(['vault.enc']);

  await options.getByLabel('Passphrase').fill(OLD_PASSPHRASE);
  await options.getByRole('button', { name: 'Import my data' }).click();
  const sidebar = options.getByRole('complementary', { name: 'Main navigation' });
  await expect(sidebar.getByText(`${ADA.firstName} ${ADA.lastName}`)).toBeVisible({ timeout: 30_000 });

  const files = await answeronce.folderFiles();
  expect(files.map((f) => f.name)).toEqual(['profile.json', 'settings.json', 'vault.enc.migrated']);
  expect(JSON.parse(files[0]!.text)).toMatchObject({ rev: 1, personal: { email: ADA.email } });
  expect(JSON.parse(files[1]!.text)).toMatchObject({ ai: { provider: 'ollama', model: 'llama3.2' } });
});
