import type { ReactNode } from 'react';
import { CircleAlert, FolderOpen, FolderPlus, FolderSync, ShieldCheck } from 'lucide-react';
import { Brand, Callout, Spinner, useAction } from './components';
import { LegacyImport } from './LegacyImport';
import type { VaultApi } from './use-vault';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-brand">
        <Brand size="lg" tagline="Private job application autofill" />
      </div>
      <div className="card auth-card">
        <div className="card-pad">{children}</div>
      </div>
      <p className="auth-foot">
        <ShieldCheck aria-hidden="true" />
        Your profile lives in a folder on your disk. Nothing personal is saved in the browser.
      </p>
    </div>
  );
}

export function FolderChip({ name }: { name: string }) {
  return (
    <div className="folder-chip">
      <FolderOpen aria-hidden="true" />
      <span className="truncate">
        Profile folder: <strong>{name}</strong>
      </span>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Callout tone="danger" icon={<CircleAlert aria-hidden="true" />} role="alert">
      {error}
    </Callout>
  );
}

/**
 * Renders folder selection / reconnect / setup flows until the profile is loaded.
 * `onOpenSettings` is set where the browser forbids file pickers and permission
 * prompts (the panel framed inside a web page): those flows then run in the
 * options tab, and this view updates through the shared session.
 */
export function VaultGate({ vault, onOpenSettings, children }: { vault: VaultApi; onOpenSettings?: () => void; children: ReactNode }) {
  const { busy, error, run } = useAction();

  if (vault.loading) {
    return (
      <div className="auth" aria-busy="true">
        <span className="muted row">
          <Spinner /> Loading…
        </span>
      </div>
    );
  }
  if (vault.session && vault.accessGranted) return <>{children}</>;

  if (onOpenSettings) {
    const reconnect = vault.handle && vault.contents !== 'empty' && vault.contents !== 'legacy';
    return (
      <AuthLayout>
        <div className="auth-head">
          <h1>{reconnect ? 'Reconnect your profile folder' : 'Set up AnswerOnce'}</h1>
          <p>
            {reconnect
              ? 'Your browser asks once per session before AnswerOnce can use your folder. It cannot ask from inside a web page, so confirm it in AnswerOnce’s settings tab.'
              : 'Choose your profile folder in AnswerOnce’s settings tab. Browsers do not allow picking folders from inside a web page.'}
          </p>
        </div>
        {vault.handle && <FolderChip name={vault.handle.name} />}
        <button type="button" className="primary lg block" onClick={onOpenSettings}>
          {reconnect ? <FolderSync aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}
          {reconnect ? 'Reconnect in settings' : 'Open settings'}
        </button>
        <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
          This panel updates on its own when you are done.
        </p>
      </AuthLayout>
    );
  }

  const changeDir = (
    <button type="button" className="link muted" disabled={busy} onClick={() => run(vault.pickDirectory)} style={{ alignSelf: 'center' }}>
      Use a different folder
    </button>
  );

  if (!vault.handle) {
    return (
      <AuthLayout>
        <div className="auth-head">
          <h1>Welcome to AnswerOnce</h1>
          <p>Autofill job applications from a profile that lives in a folder on your own disk.</p>
        </div>
        <ol className="steps">
          <li>
            <span className="step-num">1</span>
            <span>
              Choose a folder for your profile, for example <code>~/answeronce</code>.
            </span>
          </li>
          <li>
            <span className="step-num">2</span>
            <span>
              AnswerOnce keeps your data there as plain files you can open: <code>profile.json</code> and your documents.
            </span>
          </li>
          <li>
            <span className="step-num">3</span>
            <span>Import your CV once, then autofill any application.</span>
          </li>
        </ol>
        <button type="button" className="primary lg block" disabled={busy} onClick={() => run(vault.pickDirectory)}>
          <FolderOpen aria-hidden="true" />
          Choose folder…
        </button>
        <ErrorText error={error} />
      </AuthLayout>
    );
  }

  if (vault.contents === 'legacy') {
    return (
      <AuthLayout>
        <LegacyImport vault={vault} />
        {changeDir}
      </AuthLayout>
    );
  }

  if (vault.contents === 'empty') {
    return (
      <AuthLayout>
        <div className="auth-head">
          <h1>Set up this folder</h1>
          <p>
            AnswerOnce creates <code>profile.json</code> and <code>settings.json</code> here, and a <code>documents</code> folder when you add your CV.
          </p>
        </div>
        <FolderChip name={vault.handle.name} />
        <button type="button" className="primary lg block" disabled={busy} onClick={() => run(vault.create)}>
          {busy ? <Spinner /> : <FolderPlus aria-hidden="true" />}
          {busy ? 'Creating…' : 'Create profile'}
        </button>
        {changeDir}
        <ErrorText error={error} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-head">
        <h1>Reconnect your profile folder</h1>
        <p>Your browser asks once per session before AnswerOnce can use this folder again.</p>
      </div>
      <FolderChip name={vault.handle.name} />
      <button type="button" className="primary lg block" disabled={busy} onClick={() => run(vault.connect)}>
        {busy ? <Spinner /> : <FolderSync aria-hidden="true" />}
        Reconnect folder
      </button>
      {changeDir}
      <ErrorText error={error} />
    </AuthLayout>
  );
}
