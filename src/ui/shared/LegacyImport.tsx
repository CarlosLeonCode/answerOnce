import { useState, type FormEvent } from 'react';
import { FileLock2 } from 'lucide-react';
import { importLegacyVault, LEGACY_VAULT_FILE, MIGRATED_VAULT_FILE } from '../../application/legacy-migration';
import { Spinner, useAction } from './components';
import { useToast } from './toast';
import { ErrorText, FolderChip } from './VaultGate';
import type { VaultApi } from './use-vault';

/**
 * One-time import of the encrypted vault written by older AnswerOnce versions:
 * asks for the passphrase once and writes the data as plain files.
 */
export function LegacyImport({ vault }: { vault: VaultApi }) {
  const { busy, error, run } = useAction();
  const notify = useToast();
  const [passphrase, setPassphrase] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { session, missingDocuments } = await importLegacyVault(await vault.withDeps(), passphrase);
      setPassphrase('');
      vault.adopt(session);
      notify(
        'success',
        'Your data was imported',
        missingDocuments.length ? `These documents were missing and were skipped: ${missingDocuments.join(', ')}.` : 'It is now stored as plain files in your folder.',
      );
    });
  };

  return (
    <form className="stack-lg" onSubmit={submit}>
      <div className="auth-head">
        <h1>Import your old encrypted data</h1>
        <p>
          This folder has data from an older version of AnswerOnce, kept encrypted in <code>{LEGACY_VAULT_FILE}</code>. Enter its passphrase one last time: AnswerOnce
          decrypts it, writes <code>profile.json</code>, <code>settings.json</code> and your documents as plain files, and renames the old file to{' '}
          <code>{MIGRATED_VAULT_FILE}</code>.
        </p>
      </div>
      <FolderChip name={vault.handle?.name ?? ''} />
      <div className="field">
        <label className="field-label" htmlFor="legacy-passphrase">
          Passphrase
        </label>
        <input id="legacy-passphrase" type="password" autoComplete="current-password" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </div>
      <button type="submit" className="primary lg block" disabled={busy || !passphrase}>
        {busy ? <Spinner /> : <FileLock2 aria-hidden="true" />}
        {busy ? 'Importing…' : 'Import my data'}
      </button>
      <ErrorText error={error} />
    </form>
  );
}
