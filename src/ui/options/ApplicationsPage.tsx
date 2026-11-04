import { useEffect, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, ChevronRight, ClipboardList, ExternalLink, MessageSquareText, Search, Trash } from 'lucide-react';
import { deleteApplication, updateApplication } from '../../application/applications';
import {
  appliedAt,
  APPLICATION_STATUSES,
  applicationTitle,
  filterApplications,
  STATUS_LABEL,
  type Application,
  type ApplicationStatus,
} from '../../domain/applications';
import { Callout, Dialog, EmptyState, formatDay, SectionCard, Spinner } from '../shared/components';
import { useToast } from '../shared/toast';
import type { ApplicationsApi } from '../shared/use-applications';
import { errorMessage } from '../shared/use-vault';

const TONE: Record<ApplicationStatus, string> = { filled: '', applied: 'primary', interview: 'warning', offer: 'success', rejected: 'danger' };
const ATS_LABEL: Record<string, string> = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', generic: 'Other site' };

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`badge ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Only http(s) links are opened. */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function dateLine(app: Application): string {
  const applied = appliedAt(app);
  return applied ? `Applied ${formatDay(applied)}` : `Filled ${formatDay(app.createdAt)}`;
}

/** Jobs filled or applied to (applications.json): list with search and status filter, detail view. */
export function ApplicationsPage({ applications }: { applications: ApplicationsApi }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? applications.applications.find((a) => a.id === selectedId) : undefined;

  // The record was deleted (here, in another window or by an agent): back to the list.
  useEffect(() => {
    if (selectedId && !applications.loading && !selected) setSelectedId(null);
  }, [selectedId, selected, applications.loading]);

  if (selected) return <ApplicationDetail key={selected.id} application={selected} applications={applications} onBack={() => setSelectedId(null)} />;

  const all = applications.applications;
  const shown = filterApplications(all, { query, status: status || null });

  return (
    <div className="stack">
      {applications.error && (
        <Callout tone="danger" icon={<ClipboardList aria-hidden="true" />} role="alert">
          {applications.error}
        </Callout>
      )}
      <SectionCard
        title="Your applications"
        icon={<ClipboardList />}
        description="Recorded when you click “Fill this page” and “Mark as applied” in the AnswerOnce panel. Newest first."
      >
        {applications.loading ? (
          <span className="muted row">
            <Spinner /> Loading…
          </span>
        ) : all.length === 0 ? (
          <EmptyState
            icon={<BriefcaseBusiness />}
            title="No applications yet"
            description="Open a job application, click “Fill this page” in the AnswerOnce panel, and the job is recorded here. After you submit it, click “Mark as applied”."
          />
        ) : (
          <div className="stack">
            <div className="applications-filters">
              <label className="search-field">
                <Search aria-hidden="true" />
                <input type="search" value={query} placeholder="Search role, company, notes…" aria-label="Search applications" onChange={(e) => setQuery(e.target.value)} />
              </label>
              <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus | '')}>
                <option value="">All statuses</option>
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            {shown.length === 0 ? (
              <p className="muted small">No applications match these filters.</p>
            ) : (
              <ul className="card applications-list" aria-label="Applications">
                {shown.map((app) => (
                  <li key={app.id}>
                    <button type="button" className="application-row" onClick={() => setSelectedId(app.id)}>
                      <span className="icon-tile neutral" aria-hidden="true">
                        <BriefcaseBusiness />
                      </span>
                      <span className="titles">
                        <span className="item-title">{applicationTitle(app)}</span>
                        <span className="item-sub">
                          {host(app.url)} · {dateLine(app)}
                        </span>
                      </span>
                      <StatusBadge status={app.status} />
                      <ChevronRight className="chev" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ApplicationDetail(props: { application: Application; applications: ApplicationsApi; onBack: () => void }) {
  const { application: app, applications } = props;
  const notify = useToast();
  const [notes, setNotes] = useState(app.notes);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const href = safeHref(app.url);

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

  const changeStatus = (status: ApplicationStatus) =>
    act(async () => {
      await applications.run((deps) => updateApplication(deps, app.id, { status }));
      notify('success', 'Status updated', `${applicationTitle(app)}: ${STATUS_LABEL[status]}.`);
    });

  const saveNotes = () =>
    act(async () => {
      await applications.run((deps) => updateApplication(deps, app.id, { notes }));
      notify('success', 'Notes saved');
    });

  const remove = () =>
    act(async () => {
      await applications.run((deps) => deleteApplication(deps, app.id));
      notify('info', 'Application deleted', `${applicationTitle(app)} was removed from applications.json.`);
      props.onBack();
    });

  return (
    <div className="stack">
      <button type="button" className="ghost sm" style={{ alignSelf: 'flex-start' }} onClick={props.onBack}>
        <ArrowLeft aria-hidden="true" />
        All applications
      </button>

      <SectionCard
        title={applicationTitle(app)}
        icon={<BriefcaseBusiness />}
        description={
          <>
            {host(app.url)} · {ATS_LABEL[app.ats] ?? app.ats} · {dateLine(app)}
          </>
        }
        actions={
          <>
            {href && (
              <a className="button sm" href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open job
              </a>
            )}
            <button type="button" className="ghost danger sm" disabled={busy} onClick={() => setConfirm(true)}>
              <Trash aria-hidden="true" />
              Delete
            </button>
          </>
        }
      >
        <div className="application-detail-grid">
          <div className="field">
            <label className="field-label" htmlFor="application-status">
              Status
            </label>
            <select id="application-status" value={app.status} disabled={busy} onChange={(e) => void changeStatus(e.target.value as ApplicationStatus)}>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">History</span>
            <ol className="status-history" aria-label="Status history">
              {app.statusHistory.map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  <StatusBadge status={h.status} />
                  <span className="muted xs">{formatDay(h.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="application-notes">
            Notes
          </label>
          <textarea id="application-notes" rows={4} value={notes} placeholder="Contacts, interview dates, salary range…" onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="row">
          <button type="button" className="primary sm" disabled={busy || notes === app.notes} onClick={() => void saveNotes()}>
            {busy && <Spinner />}
            Save notes
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Your answers" icon={<MessageSquareText />} description="What the form held when it was filled or marked as applied. Consent fields and uploaded files are never kept.">
        {app.answers.length === 0 ? (
          <p className="muted small">No answers saved for this application.</p>
        ) : (
          <dl className="answers-snapshot">
            {app.answers.map((a, i) => (
              <div key={`${a.label}-${i}`}>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </SectionCard>

      <Dialog open={confirm} onClose={() => setConfirm(false)} labelledBy="delete-application-title">
        <div className="dialog-body">
          <div className="dialog-head">
            <span className="icon-tile" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }} aria-hidden="true">
              <Trash />
            </span>
            <div className="titles">
              <h2 id="delete-application-title">Delete this application?</h2>
              <p>{applicationTitle(app)} and its saved answers and notes are removed from applications.json. This cannot be undone.</p>
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="destructive"
            onClick={() => {
              setConfirm(false);
              void remove();
            }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
