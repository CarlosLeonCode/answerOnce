import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, FileUp, GitMerge, Menu, PencilLine, ShieldCheck, X } from 'lucide-react';
import { VaultConflictError } from '../../application/vault';
import { countAppliedSince, startOfWeek } from '../../domain/applications';
import { profileCompleteness } from '../../domain/completeness';
import { rebaseDraft, sectionLabel, type RebaseResult } from '../../domain/draft-rebase';
import type { Profile } from '../../domain/profile';
import { Brand, Callout, initials, Spinner } from '../shared/components';
import { ToastProvider, useToast } from '../shared/toast';
import { VaultGate } from '../shared/VaultGate';
import { useApplications } from '../shared/use-applications';
import { errorMessage, useVault, type VaultApi } from '../shared/use-vault';
import { AgentsPage } from './AgentsPage';
import { AiSection } from './AiSection';
import { ApplicationsPage } from './ApplicationsPage';
import { DocumentsSection } from './DocumentsSection';
import { CvImportPage } from './import/CvImportPage';
import { OverviewPage } from './OverviewPage';
import { ProposalsPage } from './ProposalsPage';
import {
  AboutSection,
  EducationSection,
  ExperienceSection,
  LinksSection,
  PersonalSection,
  PreferencesSection,
  SavedAnswersSection,
  WorkAuthorizationSection,
} from './ProfileSections';
import { NAV_GROUPS, ROUTE_META, useHashRoute, type Route } from './routes';
import { SecuritySection } from './SecuritySection';

export function OptionsApp() {
  const vault = useVault();
  return (
    <ToastProvider>
      <VaultGate vault={vault}>{vault.justCreated ? <Welcome vault={vault} /> : <ProfileEditor vault={vault} />}</VaultGate>
    </ToastProvider>
  );
}

/** First screen after creating a profile: invite to import the CV. */
function Welcome({ vault }: { vault: VaultApi }) {
  const go = (route: Route) => {
    location.hash = `/${route}`;
    vault.finishOnboarding();
  };
  return (
    <div className="auth">
      <Brand size="lg" tagline="Private job application autofill" />
      <div className="card welcome">
        <div className="card-pad">
          <span className="badge success" style={{ alignSelf: 'flex-start' }}>
            <ShieldCheck aria-hidden="true" />
            Profile created in {vault.handle?.name}
          </span>
          <div className="auth-head">
            <h1>Import your CV</h1>
            <p>Skip the typing. AnswerOnce reads your CV, organizes it into your profile and keeps the file in your folder as your resume. You review everything before it is saved.</p>
          </div>
          <button type="button" className="primary lg block" onClick={() => go('import')}>
            <FileUp aria-hidden="true" />
            Import your CV
          </button>
          <button type="button" className="ghost block" onClick={() => go('personal')}>
            <PencilLine aria-hidden="true" />
            Skip, fill manually
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({ vault }: { vault: VaultApi }) {
  const notify = useToast();
  const session = vault.session!;
  const sessionProfile = session.profile;
  const [draft, setDraft] = useState<Profile>(sessionProfile);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [conflict, setConflict] = useState<RebaseResult | null>(null);
  const [route, navigate] = useHashRoute();
  const applications = useApplications(vault);
  /** The saved profile (and its revision) the draft is based on. */
  const baseline = useRef<Profile>(sessionProfile);
  const [baseRevision, setBaseRevision] = useState(session.revision);
  const latest = useRef({ draft, dirty });
  latest.current = { draft, dirty };

  // The profile changed (save here, documents, side panel answers, CV import, an
  // agent or another window): adopt it, re-applying unsaved edits on top.
  useEffect(() => {
    if (session.revision === baseRevision && sessionProfile === baseline.current) return;
    const { draft: current, dirty: isDirty } = latest.current;
    if (!isDirty) {
      setDraft(sessionProfile);
    } else {
      const rebased = rebaseDraft(baseline.current, current, sessionProfile);
      setDraft(rebased.mine);
      setDirty(rebased.dirty);
      if (rebased.conflicts.length) setConflict(rebased);
    }
    baseline.current = sessionProfile;
    setBaseRevision(session.revision);
  }, [session.revision, sessionProfile]);

  // Changes written by someone else were loaded from disk.
  const seenExternal = useRef(vault.externalChanges);
  useEffect(() => {
    if (vault.externalChanges === seenExternal.current) return;
    seenExternal.current = vault.externalChanges;
    notify('info', 'Your profile changed (agent or another window). Reloaded.', latest.current.dirty ? 'Your unsaved edits were kept.' : undefined);
  }, [vault.externalChanges, notify]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (profile: Profile) => {
    setDraft(profile);
    setDirty(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await vault.save(draft, baseRevision);
      setDirty(false);
      notify('success', 'Changes saved', 'Your profile was written to profile.json.');
    } catch (e) {
      if (e instanceof VaultConflictError) {
        // The newer version is reloaded and the edits re-applied (see the effect above).
        await vault.refresh().catch(() => undefined);
        notify('info', 'Not saved yet: your profile changed', 'It was reloaded with your edits on top. Check them and save again.');
      } else notify('error', 'Could not save', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [baseRevision, draft, notify, vault]);

  const discard = () => {
    setDraft(vault.session!.profile);
    setDirty(false);
    setConflict(null);
    notify('info', 'Changes discarded');
  };

  const resolveConflict = (keepMine: boolean) => {
    if (!conflict) return;
    if (keepMine) setDraft(conflict.mine);
    else {
      const rebased = rebaseDraft(baseline.current, conflict.theirs, vault.session!.profile);
      setDraft(rebased.mine);
      setDirty(rebased.dirty);
    }
    setConflict(null);
  };

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving && !conflict) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save, conflict]);

  const go = (next: Route) => {
    navigate(next);
    setDrawer(false);
  };

  const completeness = profileCompleteness(draft);
  const counts: Partial<Record<Route, number>> = {
    experience: draft.experience.length,
    education: draft.education.length,
    documents: draft.documents.length,
    answers: draft.savedAnswers.length,
    proposals: draft.agentProposals.length,
    applications: applications.applications.length,
  };
  const meta = ROUTE_META[route];
  const props = { profile: draft, onChange: change, onNavigate: (r: string) => go(r as Route) };
  const name = [draft.personal.firstName, draft.personal.lastName].filter(Boolean).join(' ');

  return (
    <div className={`app${drawer ? ' drawer-open' : ''}`}>
      <div className="drawer-overlay" onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-head">
          <Brand tagline="Private autofill" />
          <button type="button" className="ghost icon sm sidebar-close" aria-label="Close menu" onClick={() => setDrawer(false)}>
            <X />
          </button>
        </div>
        <nav className="sidebar-scroll">
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? 'main'} className="nav-group">
              {group.label && <span className="nav-group-label">{group.label}</span>}
              {group.routes.map((r) => {
                const Icon = ROUTE_META[r].icon;
                const missing = completeness.missing.some((m) => m.area === r);
                return (
                  <button key={r} type="button" className="nav-item" aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}>
                    <Icon aria-hidden="true" />
                    {ROUTE_META[r].label}
                    {counts[r] ? <span className="nav-meta">{counts[r]}</span> : missing ? <span className="nav-dot" title="Missing information" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="vault-card">
            <span className="avatar" aria-hidden="true">
              {initials(draft.personal.firstName, draft.personal.lastName)}
            </span>
            <div className="titles">
              <strong>{name || 'Your profile'}</strong>
              <span>
                <span className="dot" style={{ display: 'inline-block', width: 6, height: 6, marginRight: 6, verticalAlign: 'middle', boxShadow: 'none' }} />
                Connected · {vault.handle?.name}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button type="button" className="ghost icon" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Menu />
          </button>
          <Brand />
        </header>

        <main className="content" id="main">
          <header className="page-header">
            <div className="titles">
              <h1>{route === 'overview' && draft.personal.firstName ? `Welcome back, ${draft.personal.firstName}` : meta.title}</h1>
              <p>{meta.description}</p>
            </div>
          </header>

          {conflict && (
            <div className="stack-sm" style={{ marginBottom: 16 }}>
              <Callout tone="warning" icon={<GitMerge aria-hidden="true" />} role="alert">
                <strong>Your profile changed while you were editing</strong>
                <span>
                  An agent or another window saved changes to sections you also edited: {conflict.conflicts.map(sectionLabel).join(', ')}. Your other edits were
                  kept on top of the new version.
                </span>
                <div className="row" style={{ marginTop: 4 }}>
                  <button type="button" className="primary sm" onClick={() => resolveConflict(true)}>
                    Re-apply my edits
                  </button>
                  <button type="button" className="sm" onClick={() => resolveConflict(false)}>
                    Use the saved version for these
                  </button>
                </div>
              </Callout>
            </div>
          )}

          {route === 'overview' && (
            <OverviewPage profile={draft} onNavigate={go} appliedThisWeek={countAppliedSince(applications.applications, startOfWeek(new Date()))} />
          )}
          {route === 'applications' && <ApplicationsPage applications={applications} />}
          {route === 'proposals' && <ProposalsPage vault={vault} onConnect={() => go('agents')} />}
          {route === 'import' && (
            <CvImportPage
              vault={vault}
              profile={draft}
              baseRevision={baseRevision}
              onImported={(p) => {
                setDraft(p);
                setDirty(false);
              }}
              onDone={() => go('overview')}
            />
          )}
          {route === 'personal' && <PersonalSection {...props} />}
          {route === 'links' && <LinksSection {...props} />}
          {route === 'about' && <AboutSection {...props} />}
          {route === 'experience' && <ExperienceSection {...props} />}
          {route === 'education' && <EducationSection {...props} />}
          {route === 'work' && <WorkAuthorizationSection {...props} />}
          {route === 'preferences' && <PreferencesSection {...props} />}
          {route === 'documents' && <DocumentsSection vault={vault} profile={draft} onNavigate={(r) => go(r as Route)} />}
          {route === 'answers' && <SavedAnswersSection {...props} />}
          {route === 'ai' && <AiSection {...props} />}
          {route === 'agents' && <AgentsPage profile={draft} onChange={change} vault={vault} onNavigate={go} />}
          {route === 'security' && <SecuritySection vault={vault} />}
        </main>

        {dirty && route !== 'import' && route !== 'proposals' && (
          <div className="savebar-wrap">
            <div className="savebar" role="region" aria-label="Unsaved changes">
              <span className="savebar-text">
                <CircleAlert aria-hidden="true" />
                You have unsaved changes
              </span>
              <button type="button" className="ghost" disabled={saving} onClick={discard}>
                Discard
              </button>
              <button type="button" className="primary" disabled={saving || conflict !== null} onClick={() => void save()}>
                {saving && <Spinner />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
