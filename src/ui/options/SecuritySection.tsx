import { FolderOpen, FolderSync } from 'lucide-react';
import { SectionCard } from '../shared/components';
import type { VaultApi } from '../shared/use-vault';

export function SecuritySection({ vault }: { vault: VaultApi }) {
  return (
    <>
      <SectionCard
        title="Profile folder"
        icon={<FolderOpen />}
        description={
          <>
            Your data is stored here as plain files: <code>profile.json</code>, <code>settings.json</code> and <code>documents/</code>. Anyone who can read this folder
            can read them, so keep it somewhere only you can access. The browser only remembers a handle to the folder. Switching folders does not move your files;
            copy them yourself to keep them.
          </>
        }
        footer={
          <button type="button" onClick={() => void vault.pickDirectory().catch(() => undefined)}>
            <FolderSync aria-hidden="true" />
            Change profile folder…
          </button>
        }
      >
        <div className="folder-chip">
          <FolderOpen aria-hidden="true" />
          <span className="truncate">
            Current folder: <strong>{vault.handle?.name ?? '—'}</strong>
          </span>
        </div>
      </SectionCard>
    </>
  );
}
