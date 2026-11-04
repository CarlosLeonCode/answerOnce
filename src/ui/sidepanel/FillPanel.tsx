import { useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { ChevronDown, CircleAlert, CircleCheck, CircleMinus, CircleX, FileUp, FolderOpen, Frame, Hand, WandSparkles } from 'lucide-react';
import { markApplied, recordAnswer, recordFilledPage, snapshotPage, updateApplication } from '../../application/applications';
import { fillPage, type FillReport, type UnmatchedField } from '../../application/fill-page';
import { fieldLabel as answerLabel, findByUrl } from '../../domain/applications';
import { isProfileEmpty, profileCompleteness } from '../../domain/completeness';
import type { FieldMatch, FillResult } from '../../domain/fill';
import { ATS_EMBED_ORIGINS } from '../../infrastructure/ats';
import { getActiveTab } from '../../infrastructure/page/scripting-page-gateway';
import { Callout, initials, Spinner, SwitchRow } from '../shared/components';
import { atsAdapters, fillDeps, pageGateway, sessionStore } from '../shared/container';
import { ProposalsBanner } from '../shared/ProposalsBanner';
import { useToast } from '../shared/toast';
import { useApplications } from '../shared/use-applications';
import { errorMessage, type VaultApi } from '../shared/use-vault';
import { AlreadyApplied, ApplicationCard } from './ApplicationCard';
import { openOptions } from './open-options';
import { UnmatchedItem } from './UnmatchedItem';
import { useActiveTab } from './use-active-tab';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';
const STATUS: Record<FillResult['status'], { label: string; tone: Tone }> = {
  filled: { label: 'Filled', tone: 'success' },
  'skipped-nonempty': { label: 'Kept existing value', tone: 'neutral' },
  'skipped-consent': { label: 'Consent field, left to you', tone: 'neutral' },
  failed: { label: 'Could not fill', tone: 'danger' },
  'not-found': { label: 'Field disappeared', tone: 'danger' },
};
const ICON: Record<Tone, typeof CircleCheck> = { success: CircleCheck, warning: CircleAlert, danger: CircleX, neutral: CircleMinus };

function friendlyError(error: unknown): string {
  const msg = errorMessage(error);
  if (/cannot access|permission|host/i.test(msg)) {
    return 'No access to this page. Click the AnswerOnce toolbar icon while on the job page (this grants temporary access), then try again.';
  }
  if (/chrome:\/\/|extensions gallery|webstore/i.test(msg)) return 'Browser pages cannot be filled.';
  return msg;
}

function preview(match: FieldMatch): string {
  const v = match.value;
  if (v.type === 'text') return v.text;
  if (v.type === 'bool') return v.value ? 'Yes' : 'No';
  if (v.type === 'choice') return v.candidates[0] ?? '';
  return 'Default resume';
}

const fieldLabel = (f: { label: string; ariaLabel?: string; placeholder?: string; name: string }) => f.label || f.ariaLabel || f.placeholder || f.name || 'Unlabeled field';

function Group(props: { title: string; count: number; tone: Tone; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const Icon = ICON[props.tone];
  const id = `group-${props.title.replace(/\W+/g, '-')}`;
  return (
    <section className="card result-group">
      <button type="button" className="group-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Icon className={`status-icon ${props.tone}`} aria-hidden="true" />
        {props.title}
        <span className="badge">{props.count}</span>
        <ChevronDown className="chev" aria-hidden="true" />
      </button>
      {open && <div id={id}>{props.children}</div>}
    </section>
  );
}

export function FillPanel({ vault }: { vault: VaultApi }) {
  const notify = useToast();
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<(FillReport & { tabId: number; tabUrl: string }) | null>(null);
  const [recording, setRecording] = useState(false);
  const applications = useApplications(vault);
  const activeTab = useActiveTab();
  const pageUrl = activeTab?.url || report?.tabUrl || '';
  const application = pageUrl ? findByUrl(applications.applications, pageUrl) : undefined;
  const profile = vault.session!.profile;
  const completeness = profileCompleteness(profile);
  const name = [profile.personal.firstName, profile.personal.lastName].filter(Boolean).join(' ');

  const fill = async () => {
    setBusy(true);
    setError(null);
    try {
      // First: directory permission (needs the click's user activation) for
      // documents. It also reloads the profile if an agent changed it.
      await vault.withDeps();
      const current = (await sessionStore.get())?.profile ?? profile;
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab.');
      const result = await fillPage(fillDeps(vault.handle!), tab.id, current, { overwrite });
      setReport({ ...result, tabId: tab.id, tabUrl: tab.url });
      const filled = [...result.results.values()].filter((r) => r.status === 'filled').length;
      notify(filled ? 'success' : 'info', filled ? `Filled ${filled} ${filled === 1 ? 'field' : 'fields'}` : 'No fields were filled', result.plan.unmatched.length ? `${result.plan.unmatched.length} need your input.` : undefined);
      await recordFilled(tab);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  /** Creates (or updates) this job's record in applications.json. Never fails the fill itself. */
  const recordFilled = async (tab: { id: number; url: string }) => {
    try {
      const { job, answers } = await snapshotPage(pageGateway, atsAdapters, tab);
      await applications.run((deps) => recordFilledPage(deps, job, answers));
    } catch (e) {
      notify('error', 'Could not record this application', errorMessage(e));
    }
  };

  /** Re-scans the page and keeps its final answers (never consent fields or files), status Applied. */
  const markAsApplied = async () => {
    setRecording(true);
    try {
      await vault.withDeps();
      const tab = await getActiveTab();
      if (!tab) throw new Error('No active tab.');
      const { job, answers } = await snapshotPage(pageGateway, atsAdapters, tab);
      const { application: saved } = await applications.run((deps) => markApplied(deps, job, answers));
      const n = saved.answers.length;
      notify('success', 'Marked as applied', `${n} ${n === 1 ? 'answer' : 'answers'} saved to applications.json.`);
    } catch (e) {
      notify('error', 'Could not mark as applied', friendlyError(e));
    } finally {
      setRecording(false);
    }
  };

  const rename = async (id: string, patch: { company: string; role: string }): Promise<boolean> => {
    setRecording(true);
    try {
      await applications.run((deps) => updateApplication(deps, id, patch));
      return true;
    } catch (e) {
      notify('error', 'Could not save', errorMessage(e));
      return false;
    } finally {
      setRecording(false);
    }
  };

  /** An answer inserted from the panel is added to this job's record. */
  const answerInserted = (url: string, label: string, value: string) => {
    if (!url || !label.trim()) return;
    void applications.run((deps) => recordAnswer(deps, url, { label, value })).catch(() => undefined);
  };

  const allowEmbedded = () => {
    browser.permissions
      .request({ origins: ATS_EMBED_ORIGINS })
      .then((granted) => (granted ? notify('success', 'Embedded forms allowed', 'Click “Fill this page” again.') : setError('Permission for embedded ATS forms was not granted.')))
      .catch((e: unknown) => setError(errorMessage(e)));
  };

  const rows = report
    ? report.plan.matches.map((m) => ({ match: m, status: report.results.get(m.field.uid)?.status ?? 'failed' }))
    : [];
  const filled = rows.filter((r) => r.status === 'filled');
  const problems = rows.filter((r) => r.status !== 'filled');
  const unmatched = report?.plan.unmatched ?? [];
  const kept = report?.plan.prefilled ?? [];
  const consent = report?.plan.consent ?? [];

  return (
    <div className="stack">
      <section className="card">
        <div className="status-card">
          <span className="avatar" aria-hidden="true">
            {initials(profile.personal.firstName, profile.personal.lastName)}
          </span>
          <div className="titles">
            <strong>{name || 'Your profile'}</strong>
            <span className="meta">
              <span className="dot" aria-hidden="true" />
              <span className="truncate">
                Connected · <FolderOpen aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> {vault.handle?.name}
              </span>
            </span>
          </div>
        </div>
        <div className="status-progress">
          <div className="row-nowrap">
            <span>Profile {completeness.percent}% complete</span>
            {completeness.missing.length > 0 && (
              <button type="button" className="link xs" onClick={() => openOptions('overview')}>
                Complete it
              </button>
            )}
          </div>
          <div className="bar" role="progressbar" aria-label="Profile completeness" aria-valuenow={completeness.percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${completeness.percent}%` }} />
          </div>
        </div>
      </section>

      <ProposalsBanner compact proposals={profile.agentProposals} onReview={() => openOptions('proposals')} />

      {isProfileEmpty(profile) && (
        <Callout tone="info" icon={<FileUp aria-hidden="true" />}>
          <strong>Your profile is empty</strong>
          <span>Import your CV to fill it in one step.</span>
          <button type="button" className="primary sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => openOptions('import')}>
            <FileUp aria-hidden="true" />
            Import your CV
          </button>
        </Callout>
      )}

      {application && <AlreadyApplied application={application} />}

      <section className="card fill-card">
        <button type="button" className="primary lg block" disabled={busy} onClick={() => void fill()}>
          {busy ? <Spinner /> : <WandSparkles aria-hidden="true" />}
          {busy ? 'Filling…' : 'Fill this page'}
        </button>
        <SwitchRow label="Overwrite fields that already have a value" checked={overwrite} onChange={setOverwrite} />
        <button type="button" className="link muted xs" onClick={allowEmbedded}>
          <Frame aria-hidden="true" style={{ width: 13, height: 13 }} />
          Allow embedded Greenhouse / Lever / Ashby forms
        </button>
        {error && (
          <Callout tone="danger" icon={<CircleAlert aria-hidden="true" />} role="alert">
            {error}
          </Callout>
        )}
      </section>

      {application && (
        <ApplicationCard
          application={application}
          busy={recording}
          onMarkApplied={() => void markAsApplied()}
          onRename={(patch) => rename(application.id, patch)}
        />
      )}

      {report && (
        <>
          <div className="row-nowrap" style={{ justifyContent: 'space-between' }}>
            <h2>Results</h2>
            <span className="badge primary">{report.plan.ats === 'generic' ? 'Generic form' : report.plan.ats}</span>
          </div>
          <div className="summary-chips">
            <div className="summary-chip success">
              <strong>
                <CircleCheck aria-hidden="true" />
                {filled.length}
              </strong>
              <span>Filled</span>
            </div>
            <div className="summary-chip warning">
              <strong>
                <CircleAlert aria-hidden="true" />
                {unmatched.length}
              </strong>
              <span>Need input</span>
            </div>
            <div className="summary-chip neutral">
              <strong>
                <CircleMinus aria-hidden="true" />
                {kept.length}
              </strong>
              <span>Kept</span>
            </div>
          </div>

          {unmatched.length > 0 && (
            <section className="stack-sm" aria-labelledby="needs-input-title">
              <h3 id="needs-input-title" className="subsection-title" style={{ marginTop: 4 }}>
                Needs your input
              </h3>
              <div>
                {unmatched.map((u: UnmatchedField) => (
                  <UnmatchedItem
                    key={u.field.uid}
                    vault={vault}
                    item={u}
                    tabId={report.tabId}
                    jobText={report.plan.jobText}
                    onInserted={(value) => answerInserted(report.tabUrl, answerLabel(u.field), value)}
                  />
                ))}
              </div>
            </section>
          )}

          {filled.length > 0 && (
            <Group title="Filled" count={filled.length} tone="success" defaultOpen={unmatched.length === 0}>
              <ul className="result-list">
                {filled.map(({ match }) => (
                  <li key={match.field.uid} className="result-item">
                    <CircleCheck className="status-icon success" aria-label="Filled" />
                    <div className="titles">
                      <strong>{fieldLabel(match.field)}</strong>
                      <span>{preview(match)}</span>
                    </div>
                    <span className="source-tag">{match.source}</span>
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {problems.length > 0 && (
            <Group title="Not filled" count={problems.length} tone="danger" defaultOpen>
              <ul className="result-list">
                {problems.map(({ match, status }) => {
                  const s = STATUS[status];
                  const Icon = ICON[s.tone];
                  return (
                    <li key={match.field.uid} className="result-item">
                      <Icon className={`status-icon ${s.tone}`} aria-hidden="true" />
                      <div className="titles">
                        <strong>{fieldLabel(match.field)}</strong>
                        <span>
                          {s.label} · {preview(match)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Group>
          )}

          {consent.length > 0 && (
            <Group title="Left to you" count={consent.length} tone="neutral" defaultOpen>
              <ul className="result-list">
                {consent.map(({ field }) => (
                  <li key={field.uid} className="result-item">
                    <Hand className="status-icon neutral" aria-hidden="true" />
                    <div className="titles">
                      <strong>{fieldLabel(field)}</strong>
                      <span>Consent, terms or opt-in. AnswerOnce never answers these for you.</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {kept.length > 0 && (
            <Group title="Kept existing values" count={kept.length} tone="neutral">
              <ul className="result-list">
                {kept.map(({ field }) => (
                  <li key={field.uid} className="result-item">
                    <CircleMinus className="status-icon neutral" aria-hidden="true" />
                    <div className="titles">
                      <strong>{fieldLabel(field)}</strong>
                      <span>Already had a value. Turn on “Overwrite” to replace it.</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Group>
          )}
        </>
      )}
    </div>
  );
}
