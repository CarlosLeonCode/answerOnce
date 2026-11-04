import { useRef, useState, type DragEvent } from 'react';
import { FileText, FileUp, Files, Star, Trash, Upload } from 'lucide-react';
import { addDocument, removeDocument, setDefaultResume } from '../../application/vault';
import { defaultResume, DOCUMENT_KINDS, type DocumentKind, type DocumentRef, type Profile } from '../../domain/profile';
import { Dialog, EmptyState, formatSize, SectionCard, Segmented, Spinner } from '../shared/components';
import { useToast } from '../shared/toast';
import { errorMessage, type VaultApi } from '../shared/use-vault';

const KIND_LABEL: Record<DocumentKind, string> = { cv: 'CV / Resume', cover_letter: 'Cover letter', other: 'Other' };
const MAX_BYTES = 10 * 1024 * 1024;

/** Documents are copied straight into documents/ in the profile folder; changes apply immediately. */
export function DocumentsSection(props: { vault: VaultApi; profile: Profile; onNavigate: (route: string) => void }) {
  const { vault, profile } = props;
  const notify = useToast();
  const [kind, setKind] = useState<DocumentKind>('cv');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState<DocumentRef | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resume = defaultResume(profile);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify('error', 'Something went wrong', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File) =>
    act(async () => {
      if (file.size > MAX_BYTES) throw new Error('Files over 10 MB are not supported.');
      const deps = await vault.withDeps();
      const bytes = new Uint8Array(await file.arrayBuffer());
      await addDocument(deps, { kind, fileName: file.name, mimeType: file.type, bytes });
      notify('success', 'Document added', `${file.name} was copied to your profile folder.`);
    }).finally(() => {
      if (fileInput.current) fileInput.current.value = '';
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  };

  return (
    <>
      <SectionCard
        title="Your documents"
        icon={<Files />}
        description="Stored as regular files in the documents folder of your profile folder. The default CV is attached to resume upload fields."
        actions={
          <button type="button" className="sm" onClick={() => props.onNavigate('import')}>
            <FileUp aria-hidden="true" />
            Import from CV
          </button>
        }
      >
        {profile.documents.length === 0 ? (
          <EmptyState icon={<FileText />} title="No documents yet" description="Upload your CV below, or import it to also fill your profile automatically.">
            <button type="button" className="primary" onClick={() => props.onNavigate('import')}>
              <FileUp aria-hidden="true" />
              Import from CV
            </button>
          </EmptyState>
        ) : (
          <div className="card" style={{ boxShadow: 'none' }}>
            {profile.documents.map((d) => {
              const isDefault = d.id === resume?.id;
              return (
                <div key={d.id} className="doc-row">
                  <span className="icon-tile neutral" aria-hidden="true">
                    <FileText />
                  </span>
                  <div className="titles">
                    <span className="item-title">{d.fileName}</span>
                    <span className="item-sub">
                      {KIND_LABEL[d.kind]} · {formatSize(d.size)} · added {new Date(d.addedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {isDefault && (
                    <span className="badge primary">
                      <Star aria-hidden="true" />
                      Default resume
                    </span>
                  )}
                  {d.kind === 'cv' && !isDefault && (
                    <button type="button" className="sm" disabled={busy} onClick={() => void act(async () => void (await setDefaultResume(await vault.withDeps(), d.id)))}>
                      Set as default
                    </button>
                  )}
                  <button type="button" className="ghost danger icon sm" aria-label={`Delete ${d.fileName}`} disabled={busy} onClick={() => setConfirm(d)}>
                    <Trash />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Upload a document" description="PDF, DOCX, TXT, RTF or ODT up to 10 MB. Copied into the documents folder of your profile folder.">
        <div className="field">
          <span className="field-label">Document type</span>
          <Segmented label="Document type" value={kind} onChange={setKind} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </div>
        <label
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <span className="icon-tile" aria-hidden="true">
            {busy ? <Spinner /> : <Upload />}
          </span>
          <strong>{busy ? 'Saving…' : 'Drop a file here or click to browse'}</strong>
          <span>Saved as: {KIND_LABEL[kind]}</span>
          <input
            ref={fileInput}
            type="file"
            aria-label="Upload document"
            accept=".pdf,.doc,.docx,.txt,.rtf,.odt"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </SectionCard>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="delete-doc-title">
        <div className="dialog-body">
          <div className="dialog-head">
            <span className="icon-tile" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }} aria-hidden="true">
              <Trash />
            </span>
            <div className="titles">
              <h2 id="delete-doc-title">Delete {confirm?.fileName}?</h2>
              <p>The file is deleted from your profile folder. This cannot be undone.</p>
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="destructive"
            onClick={() => {
              const doc = confirm;
              setConfirm(null);
              if (doc) void act(async () => void (await removeDocument(await vault.withDeps(), doc.id)));
            }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </>
  );
}
