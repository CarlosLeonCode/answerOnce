import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Check, History, Pencil, Send, X } from 'lucide-react';
import { appliedAt, applicationTitle, hasApplied, STATUS_LABEL, type Application } from '../../domain/applications';
import { Callout, formatDay, Spinner } from '../shared/components';

/** "You already applied here on Oct 3": shown when the page's posting was already applied to. */
export function AlreadyApplied({ application }: { application: Application }) {
  if (!hasApplied(application.status)) return null;
  const at = appliedAt(application);
  return (
    <div role="region" aria-label="Already applied">
      <Callout tone="warning" icon={<History aria-hidden="true" />} role="status">
        <strong>You already applied here{at ? ` on ${formatDay(at)}` : ''}</strong>
        <span>
          {applicationTitle(application)} · {STATUS_LABEL[application.status]}
        </span>
      </Callout>
    </div>
  );
}

/**
 * Compact record of this job: "Role at Company · Filled", editable company and
 * role, and "Mark as applied" (snapshots the final answers on the page).
 */
export function ApplicationCard(props: {
  application: Application;
  busy: boolean;
  onMarkApplied: () => void;
  onRename: (patch: { company: string; role: string }) => Promise<boolean>;
}) {
  const { application, busy } = props;
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(application.role);
  const [company, setCompany] = useState(application.company);

  useEffect(() => {
    if (editing) return;
    setRole(application.role);
    setCompany(application.company);
  }, [application.role, application.company, editing]);

  const save = async () => {
    if (await props.onRename({ company: company.trim(), role: role.trim() })) setEditing(false);
  };

  const applied = hasApplied(application.status);
  return (
    <section className="card application-card" aria-label="This application">
      <div className="application-head">
        <span className="icon-tile neutral" aria-hidden="true">
          <BriefcaseBusiness />
        </span>
        <div className="titles">
          <strong className="truncate" title={applicationTitle(application)}>
            {application.role || 'Unknown role'}
            {application.company && <span className="muted"> at {application.company}</span>}
          </strong>
          <span className="meta">
            <span className={`badge ${applied ? 'success' : ''}`}>{STATUS_LABEL[application.status]}</span>
            {application.answers.length > 0 && (
              <span>
                · {application.answers.length} {application.answers.length === 1 ? 'answer' : 'answers'}
              </span>
            )}
          </span>
        </div>
        {!editing && (
          <button type="button" className="ghost icon sm" aria-label="Edit company and role" disabled={busy} onClick={() => setEditing(true)}>
            <Pencil />
          </button>
        )}
      </div>
      {editing && (
        <form
          className="application-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span className="field-label">Role</span>
            <input value={role} maxLength={200} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Company</span>
            <input value={company} maxLength={200} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className="primary sm" disabled={busy}>
              <Check aria-hidden="true" />
              Save
            </button>
            <button type="button" className="ghost sm" disabled={busy} onClick={() => setEditing(false)}>
              <X aria-hidden="true" />
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="application-actions">
        <button type="button" className={applied ? 'sm' : 'primary sm'} disabled={busy} onClick={props.onMarkApplied}>
          {busy ? <Spinner /> : <Send aria-hidden="true" />}
          {applied ? 'Update answers' : 'Mark as applied'}
        </button>
        <span className="muted xs">{applied ? 'Saves the answers now on the page.' : 'After you submit: saves your final answers.'}</span>
      </div>
    </section>
  );
}
