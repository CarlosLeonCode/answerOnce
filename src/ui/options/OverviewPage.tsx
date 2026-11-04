import { ArrowRight, Briefcase, Check, ClipboardList, CircleCheck, CircleDashed, FileText, FileUp, GraduationCap, MessageSquareText, MousePointerClick, Plug, ScanText, ShieldCheck } from 'lucide-react';
import { profileCompleteness } from '../../domain/completeness';
import type { Profile } from '../../domain/profile';
import { ProgressRing } from '../shared/components';
import { ProposalsBanner } from '../shared/ProposalsBanner';
import type { Route } from './routes';

export function OverviewPage({ profile, onNavigate, appliedThisWeek }: { profile: Profile; onNavigate: (route: Route) => void; appliedThisWeek: number }) {
  const completeness = profileCompleteness(profile);
  const stats = [
    { route: 'applications', label: 'Applied this week', value: appliedThisWeek, icon: ClipboardList },
    { route: 'experience', label: 'Roles', value: profile.experience.length, icon: Briefcase },
    { route: 'education', label: 'Education', value: profile.education.length, icon: GraduationCap },
    { route: 'documents', label: 'Documents', value: profile.documents.length, icon: FileText },
    { route: 'answers', label: 'Saved answers', value: profile.savedAnswers.length, icon: MessageSquareText },
  ] as const;
  const ordered = [...completeness.missing, ...completeness.items.filter((i) => i.done)];

  return (
    <>
      <ProposalsBanner proposals={profile.agentProposals} onReview={() => onNavigate('proposals')} />
      <div className="overview-grid">
        <section className="card card-pad stack-lg" aria-labelledby="strength-title">
          <div className="stack-sm">
            <h2 id="strength-title">Profile strength</h2>
            <p className="muted small">
              {completeness.missing.length === 0
                ? 'Everything most application forms ask for is in your profile.'
                : completeness.missing.length === 1
                  ? '1 key item is missing. Add it to fill more fields automatically.'
                  : `${completeness.missing.length} key items are missing. Add them to fill more fields automatically.`}
            </p>
          </div>
          <div className="strength">
            <ProgressRing percent={completeness.percent} label="Profile completeness" />
            <ul className="checklist">
              {ordered.slice(0, 7).map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.done ? 'done' : 'todo'} onClick={() => onNavigate(item.area)}>
                    {item.done ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                    <span>{item.label}</span>
                    <span className="sr-only">{item.done ? '(complete)' : '(missing)'}</span>
                    <ArrowRight className="go" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="cta-card" aria-labelledby="import-cta-title">
          <span className="icon-tile" aria-hidden="true">
            <ScanText />
          </span>
          <div className="stack-sm">
            <h2 id="import-cta-title">Import from your CV</h2>
            <p>Drop your CV and AnswerOnce organizes it into your profile. You review every value before it is saved.</p>
          </div>
          <ul>
            <li>
              <Check aria-hidden="true" />
              PDF, DOCX, TXT or Markdown
            </li>
            <li>
              <Check aria-hidden="true" />
              Text is read locally on your computer
            </li>
            <li>
              <Check aria-hidden="true" />
              Original file kept in your folder as your resume
            </li>
          </ul>
          <button type="button" className="primary" onClick={() => onNavigate('import')} style={{ alignSelf: 'flex-start' }}>
            <FileUp aria-hidden="true" />
            Import from CV
          </button>
        </section>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <button key={s.route} type="button" className="stat" onClick={() => onNavigate(s.route)}>
            <s.icon className="stat-icon" aria-hidden="true" />
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </button>
        ))}
      </div>

      <section className="card" aria-labelledby="how-title">
        <header className="section-head">
          <div className="titles">
            <h2 id="how-title">How filling works</h2>
            <p>AnswerOnce only touches a page when you ask it to, and never submits.</p>
          </div>
        </header>
        <div className="how">
          <div>
            <span className="icon-tile neutral" aria-hidden="true">
              <MousePointerClick />
            </span>
            <h3>1. Open an application</h3>
            <p>Click the AnswerOnce icon in the toolbar on a Greenhouse, Lever, Ashby or other job form.</p>
          </div>
          <div>
            <span className="icon-tile neutral" aria-hidden="true">
              <ScanText />
            </span>
            <h3>2. Fill this page</h3>
            <p>Matching fields are filled from your profile. Open questions can be drafted with AI.</p>
          </div>
          <div>
            <span className="icon-tile neutral" aria-hidden="true">
              <ShieldCheck />
            </span>
            <h3>3. Review and submit</h3>
            <p>Check the form and submit it yourself. Answers you save are reused next time.</p>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="agents-cta-title">
        <header className="section-head" style={{ borderBottom: 'none', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="icon-tile neutral" aria-hidden="true">
            <Plug />
          </span>
          <div className="titles">
            <h2 id="agents-cta-title">Use AnswerOnce from an AI agent</h2>
            <p>Claude Code, Claude Desktop, Codex, Antigravity, OpenCode or Cursor can read your profile, import your CV and propose changes for you to review.</p>
          </div>
          <button type="button" onClick={() => onNavigate('agents')}>
            Connect an agent
            <ArrowRight aria-hidden="true" />
          </button>
        </header>
      </section>
    </>
  );
}
