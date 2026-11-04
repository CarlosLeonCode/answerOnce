import { parseProfile, type DocumentRef, type Profile } from '../domain/profile';
import type { ProfileSession } from '../ports/session-store';
import { PROFILE_FILE, type VaultStorage } from '../ports/vault-storage';
import { base64ToBytes, utf8 } from '../shared/encoding';
import { createProfile, documentPath, VaultError, type VaultDeps } from './vault';

/**
 * One-time import of data written by older AnswerOnce versions, which kept the
 * profile in a passphrase-encrypted `vault.enc` (PBKDF2-SHA256 -> AES-GCM-256)
 * and each document in its own encrypted `*.enc` file next to it.
 *
 * Decrypt-only: nothing is ever encrypted again. The passphrase is asked once,
 * the plain files are written (profile.json, settings.json, documents/), then
 * `vault.enc` is renamed to `vault.enc.migrated` and the old document files are
 * deleted.
 */

export const LEGACY_VAULT_FILE = 'vault.enc';
export const MIGRATED_VAULT_FILE = `${LEGACY_VAULT_FILE}.migrated`;

/** The encrypted JSON envelope used by older versions for vault.enc and documents. */
interface LegacyEnvelope {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
  salt: string;
  iv: string;
  ciphertext: string;
}

export class WrongPassphraseError extends VaultError {
  constructor() {
    super('Wrong passphrase, or the old encrypted file is damaged. Nothing was changed.');
    this.name = 'WrongPassphraseError';
  }
}

function parseLegacyEnvelope(text: string, name: string): LegacyEnvelope {
  let e: Partial<LegacyEnvelope> | null = null;
  try {
    e = JSON.parse(text) as Partial<LegacyEnvelope>;
  } catch {
    // reported below
  }
  if (
    !e ||
    e.v !== 1 ||
    e.kdf?.name !== 'PBKDF2' ||
    e.kdf.hash !== 'SHA-256' ||
    typeof e.kdf.iterations !== 'number' ||
    e.kdf.iterations < 100_000 ||
    typeof e.salt !== 'string' ||
    typeof e.iv !== 'string' ||
    typeof e.ciphertext !== 'string'
  ) {
    throw new VaultError(`${name} is not an encrypted file from an older AnswerOnce version.`);
  }
  return e as LegacyEnvelope;
}

async function deriveLegacyKey(passphrase: string, envelope: LegacyEnvelope): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey('raw', utf8.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(envelope.salt), iterations: envelope.kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

async function decryptLegacy(key: CryptoKey, envelope: LegacyEnvelope): Promise<Uint8Array> {
  try {
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext));
    return new Uint8Array(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}

/** True when the folder still holds data from an older version that was not imported yet. */
export async function hasLegacyVault(storage: VaultStorage): Promise<boolean> {
  return storage.exists(LEGACY_VAULT_FILE);
}

export interface LegacyImportResult {
  session: ProfileSession;
  /** File names of documents referenced by the old profile whose file was missing. */
  missingDocuments: string[];
}

/**
 * Decrypts the old vault and its documents with the passphrase and writes them
 * as plain files. Everything is decrypted in memory before anything is written,
 * so a wrong passphrase or a damaged file changes nothing.
 * @throws WrongPassphraseError
 */
export async function importLegacyVault(deps: VaultDeps, passphrase: string): Promise<LegacyImportResult> {
  if (await deps.storage.exists(PROFILE_FILE)) throw new VaultError(`This folder already contains a ${PROFILE_FILE}. Open it instead.`);
  const text = await deps.storage.readText(LEGACY_VAULT_FILE);
  if (text === null) throw new VaultError(`No ${LEGACY_VAULT_FILE} in this folder.`);
  const envelope = parseLegacyEnvelope(text, LEGACY_VAULT_FILE);
  const key = await deriveLegacyKey(passphrase, envelope);
  let profile: Profile;
  try {
    profile = parseProfile(JSON.parse(utf8.decode(await decryptLegacy(key, envelope))));
  } catch (error) {
    if (error instanceof WrongPassphraseError) throw error;
    throw new VaultError(`${LEGACY_VAULT_FILE} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Decrypt every document (profile documents and CVs attached to pending agent proposals).
  const refs = [...profile.documents, ...profile.agentProposals.flatMap((p) => (p.pendingDocument ? [p.pendingDocument] : []))];
  const files = new Map<string, { legacyName: string; storedAs: string; bytes: Uint8Array }>();
  const missingDocuments: string[] = [];
  for (const ref of refs) {
    const docText = await deps.storage.readText(ref.storedAs).catch(() => null);
    if (docText === null) {
      missingDocuments.push(ref.fileName);
      continue;
    }
    const bytes = await decryptLegacy(key, parseLegacyEnvelope(docText, ref.storedAs));
    files.set(ref.id, { legacyName: ref.storedAs, storedAs: documentPath(ref.fileName, ref.id), bytes });
  }
  const migrate = (ref: DocumentRef): DocumentRef | null => {
    const file = files.get(ref.id);
    return file ? { ...ref, storedAs: file.storedAs, size: file.bytes.byteLength } : null;
  };
  const documents = profile.documents.map(migrate).filter((d): d is DocumentRef => d !== null);
  const migrated: Profile = {
    ...profile,
    documents,
    defaultResumeId: documents.some((d) => d.id === profile.defaultResumeId) ? profile.defaultResumeId : '',
    agentProposals: profile.agentProposals.map((p) => ({ ...p, pendingDocument: p.pendingDocument ? migrate(p.pendingDocument) : null })),
  };

  for (const file of files.values()) await deps.storage.writeBytes(file.storedAs, file.bytes);
  let session: ProfileSession;
  try {
    session = await createProfile(deps, migrated);
  } catch (error) {
    for (const file of files.values()) await deps.storage.remove(file.storedAs).catch(() => undefined);
    throw error;
  }

  // The plain files are on disk: retire the old ones.
  await deps.storage.writeText(MIGRATED_VAULT_FILE, text);
  await deps.storage.remove(LEGACY_VAULT_FILE);
  for (const file of files.values()) await deps.storage.remove(file.legacyName).catch(() => undefined);
  return { session, missingDocuments };
}
