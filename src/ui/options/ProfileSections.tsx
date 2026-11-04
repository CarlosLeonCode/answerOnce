import { Briefcase, Building, Check, FileUp, GraduationCap, Laptop, MapPin, MessageSquareText, Plus, Trash } from 'lucide-react';
import { newId, WORK_MODES, type Profile, type WorkMode } from '../../domain/profile';
import { SectionCard, TextField, TriState } from '../shared/components';
import { ListEditor, TagInput } from './fields';

export interface SectionProps {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onNavigate?: (route: string) => void;
}

function period(start: string, end: string, current?: boolean): string {
  return [start, current ? 'Present' : end].filter(Boolean).join(' – ');
}

export function PersonalSection({ profile, onChange }: SectionProps) {
  const p = profile.personal;
  const set = (patch: Partial<Profile['personal']>) => onChange({ ...profile, personal: { ...p, ...patch } });
  return (
    <>
      <SectionCard title="Name" description="As it should appear on applications.">
        <div className="grid">
          <TextField label="First name" value={p.firstName} autoComplete="given-name" onChange={(v) => set({ firstName: v })} />
          <TextField label="Last name" value={p.lastName} autoComplete="family-name" onChange={(v) => set({ lastName: v })} />
          <TextField label="Preferred name" optional value={p.preferredName} onChange={(v) => set({ preferredName: v })} hint="Used when a form asks what you like to be called." />
          <TextField label="Pronouns" optional value={p.pronouns} placeholder="she/her" onChange={(v) => set({ pronouns: v })} />
        </div>
      </SectionCard>
      <SectionCard title="Contact" description="Only sent to the page you are filling, never to AI providers when answering questions.">
        <div className="grid">
          <TextField label="Email" type="email" value={p.email} placeholder="you@example.com" onChange={(v) => set({ email: v })} />
          <TextField label="Phone" type="tel" value={p.phone} placeholder="+34 600 000 000" onChange={(v) => set({ phone: v })} hint="Include the country code." />
        </div>
      </SectionCard>
      <SectionCard title="Location">
        <div className="grid">
          <TextField
            className="span-2"
            label="Location"
            value={p.location}
            placeholder="Madrid, Spain"
            onChange={(v) => set({ location: v })}
            hint="Exactly as you want it shown in a single “Location” field."
          />
          <TextField label="City" value={p.city} onChange={(v) => set({ city: v })} />
          <TextField label="Country" value={p.country} onChange={(v) => set({ country: v })} />
        </div>
      </SectionCard>
    </>
  );
}

export function LinksSection({ profile, onChange }: SectionProps) {
  const l = profile.links;
  const set = (patch: Partial<Profile['links']>) => onChange({ ...profile, links: { ...l, ...patch } });
  const others = l.other;
  const setOther = (index: number, patch: Partial<{ label: string; url: string }>) =>
    set({ other: others.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  return (
    <>
      <SectionCard title="Profiles" description="Full URLs, e.g. https://linkedin.com/in/your-name.">
        <div className="grid">
          <TextField label="LinkedIn" type="url" value={l.linkedin} placeholder="https://linkedin.com/in/…" onChange={(v) => set({ linkedin: v })} />
          <TextField label="GitHub" type="url" value={l.github} placeholder="https://github.com/…" onChange={(v) => set({ github: v })} />
          <TextField className="span-2" label="Portfolio / website" type="url" value={l.portfolio} placeholder="https://…" onChange={(v) => set({ portfolio: v })} />
        </div>
      </SectionCard>
      <SectionCard
        title="Other links"
        description="Publications, Dribbble, Stack Overflow… used when a form asks for “other website”."
        actions={
          others.length > 0 && (
            <button type="button" className="sm" onClick={() => set({ other: [...others, { label: '', url: '' }] })}>
              <Plus aria-hidden="true" />
              Add link
            </button>
          )
        }
      >
        {others.length === 0 ? (
          <div className="row">
            <button type="button" onClick={() => set({ other: [{ label: '', url: '' }] })}>
              <Plus aria-hidden="true" />
              Add link
            </button>
            <span className="muted small">No other links yet.</span>
          </div>
        ) : (
          <div className="stack">
            {others.map((o, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                <div style={{ flex: '0 0 32%', minWidth: 0 }}>
                  <TextField label="Label" value={o.label} placeholder="Blog" onChange={(v) => setOther(i, { label: v })} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TextField label="URL" type="url" value={o.url} placeholder="https://…" onChange={(v) => setOther(i, { url: v })} />
                </div>
                <button type="button" className="ghost danger icon" aria-label={`Remove link ${o.label || i + 1}`} onClick={() => set({ other: others.filter((_, j) => j !== i) })}>
                  <Trash />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

export function AboutSection({ profile, onChange }: SectionProps) {
  return (
    <>
      <SectionCard title="Headline & summary" description="Used for “current title” style questions and as context for AI-drafted answers.">
        <TextField label="Headline" value={profile.headline} placeholder="Senior Backend Engineer" onChange={(v) => onChange({ ...profile, headline: v })} />
        <TextField
          label="Summary"
          multiline
          rows={5}
          value={profile.summary}
          placeholder="A few sentences about your experience and what you are looking for."
          onChange={(v) => onChange({ ...profile, summary: v })}
        />
      </SectionCard>
      <SectionCard title="Skills" description="Languages, frameworks, tools and domains.">
        <TagInput
          label="Skills"
          values={profile.skills}
          placeholder="Type a skill and press Enter"
          hint="Separate several with commas."
          onChange={(skills) => onChange({ ...profile, skills })}
        />
      </SectionCard>
    </>
  );
}

export function WorkAuthorizationSection({ profile, onChange }: SectionProps) {
  const w = profile.workAuthorization;
  const set = (patch: Partial<Profile['workAuthorization']>) => onChange({ ...profile, workAuthorization: { ...w, ...patch } });
  return (
    <>
      <SectionCard title="Right to work" description="Answers “Are you authorized to work in…?” and sponsorship questions.">
        <TagInput
          label="Countries or regions you are authorized to work in"
          values={w.countriesAuthorized}
          placeholder="Spain, European Union"
          onChange={(countriesAuthorized) => set({ countriesAuthorized })}
        />
        <TriState label="Needs visa sponsorship" value={w.needsSponsorship} onChange={(v) => set({ needsSponsorship: v })} hint="“Ask me” leaves the question for you to answer on each form." />
      </SectionCard>
      <SectionCard title="Availability">
        <div className="grid">
          <TextField label="Notice period" value={w.noticePeriod} placeholder="30 days" onChange={(v) => set({ noticePeriod: v })} />
          <TextField label="Earliest start date" value={w.availability} placeholder="Immediately" onChange={(v) => set({ availability: v })} />
        </div>
      </SectionCard>
    </>
  );
}

const MODE_LABEL: Record<WorkMode, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const MODE_ICON: Record<WorkMode, typeof Laptop> = { remote: Laptop, hybrid: Building, onsite: MapPin };

export function PreferencesSection({ profile, onChange }: SectionProps) {
  const pr = profile.preferences;
  const set = (patch: Partial<Profile['preferences']>) => onChange({ ...profile, preferences: { ...pr, ...patch } });
  const toggle = (mode: WorkMode) =>
    set({ workModes: pr.workModes.includes(mode) ? pr.workModes.filter((m) => m !== mode) : [...pr.workModes, mode] });
  return (
    <>
      <SectionCard title="Compensation" description="Only filled into fields that explicitly ask for expected salary.">
        <div className="grid">
          <TextField label="Expected salary" value={pr.expectedSalary} placeholder="60000" onChange={(v) => set({ expectedSalary: v })} />
          <TextField label="Currency" value={pr.salaryCurrency} placeholder="EUR" onChange={(v) => set({ salaryCurrency: v })} />
        </div>
      </SectionCard>
      <SectionCard title="Work setup">
        <div className="field">
          <span className="field-label" id="work-modes-label">
            Work modes you accept
          </span>
          <div className="chips" role="group" aria-labelledby="work-modes-label">
            {WORK_MODES.map((mode) => {
              const on = pr.workModes.includes(mode);
              const Icon = on ? Check : MODE_ICON[mode];
              return (
                <button key={mode} type="button" className="chip" aria-pressed={on} onClick={() => toggle(mode)}>
                  <Icon aria-hidden="true" />
                  {MODE_LABEL[mode]}
                </button>
              );
            })}
          </div>
        </div>
        <TriState label="Willing to relocate" value={pr.willingToRelocate} onChange={(v) => set({ willingToRelocate: v })} />
      </SectionCard>
    </>
  );
}

function ImportHint({ onNavigate }: { onNavigate?: (route: string) => void }) {
  if (!onNavigate) return null;
  return (
    <button type="button" onClick={() => onNavigate('import')}>
      <FileUp aria-hidden="true" />
      Import from CV
    </button>
  );
}

export function ExperienceSection({ profile, onChange, onNavigate }: SectionProps) {
  return (
    <SectionCard title="Work experience" description="Most recent first. The first role marked as current answers “current company” and “current title”.">
      <ListEditor
        items={profile.experience}
        onChange={(experience) => onChange({ ...profile, experience })}
        create={() => ({ id: newId(), company: '', title: '', location: '', startDate: '', endDate: '', current: false, description: '' })}
        addLabel="Add experience"
        itemName="role"
        icon={<Briefcase />}
        summary={(e) => ({
          title: [e.title, e.company].filter(Boolean).join(' · '),
          subtitle: [period(e.startDate, e.endDate, e.current), e.location].filter(Boolean).join(' · '),
          badge: e.current ? <span className="badge success">Current</span> : undefined,
        })}
        empty={{ title: 'No experience yet', description: 'Add your roles, or import them from your CV in one step.', extra: <ImportHint onNavigate={onNavigate} /> }}
        render={(e, update) => (
          <>
            <div className="grid">
              <TextField label="Title" value={e.title} placeholder="Software Engineer" onChange={(v) => update({ title: v })} />
              <TextField label="Company" value={e.company} onChange={(v) => update({ company: v })} />
              <TextField label="Start" value={e.startDate} placeholder="YYYY-MM" onChange={(v) => update({ startDate: v })} />
              {e.current ? (
                <div className="field">
                  <span className="field-label">End</span>
                  <input value="Present" disabled aria-label="End date" />
                </div>
              ) : (
                <TextField label="End" value={e.endDate} placeholder="YYYY-MM" onChange={(v) => update({ endDate: v })} />
              )}
              <TextField label="Location" value={e.location} onChange={(v) => update({ location: v })} />
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label className="check" style={{ height: 'var(--control-h)' }}>
                  <input type="checkbox" checked={e.current} onChange={(ev) => update({ current: ev.target.checked, endDate: ev.target.checked ? '' : e.endDate })} />
                  I currently work here
                </label>
              </div>
            </div>
            <TextField label="Description" multiline value={e.description} placeholder="What you did and achieved." onChange={(v) => update({ description: v })} />
          </>
        )}
      />
    </SectionCard>
  );
}

export function EducationSection({ profile, onChange, onNavigate }: SectionProps) {
  return (
    <SectionCard title="Education" description="The first entry answers “school”, “degree” and “field of study” questions.">
      <ListEditor
        items={profile.education}
        onChange={(education) => onChange({ ...profile, education })}
        create={() => ({ id: newId(), school: '', degree: '', field: '', startDate: '', endDate: '' })}
        addLabel="Add education"
        itemName="education"
        icon={<GraduationCap />}
        summary={(e) => ({
          title: e.school,
          subtitle: [[e.degree, e.field].filter(Boolean).join(' in '), period(e.startDate, e.endDate)].filter(Boolean).join(' · '),
        })}
        empty={{ title: 'No education yet', description: 'Add degrees and certifications, or import them from your CV.', extra: <ImportHint onNavigate={onNavigate} /> }}
        render={(e, update) => (
          <div className="grid">
            <TextField className="span-2" label="School" value={e.school} onChange={(v) => update({ school: v })} />
            <TextField label="Degree" value={e.degree} placeholder="BSc" onChange={(v) => update({ degree: v })} />
            <TextField label="Field of study" value={e.field} placeholder="Computer Science" onChange={(v) => update({ field: v })} />
            <TextField label="Start" value={e.startDate} placeholder="YYYY" onChange={(v) => update({ startDate: v })} />
            <TextField label="End" value={e.endDate} placeholder="YYYY" onChange={(v) => update({ endDate: v })} />
          </div>
        )}
      />
    </SectionCard>
  );
}

export function SavedAnswersSection({ profile, onChange }: SectionProps) {
  return (
    <SectionCard
      title="Answer memory"
      description="When a form question is similar to a saved question, its answer is reused. Save answers here or from the side panel."
    >
      <ListEditor
        items={profile.savedAnswers}
        onChange={(savedAnswers) => onChange({ ...profile, savedAnswers })}
        create={() => ({ id: newId(), label: '', answer: '', updatedAt: new Date().toISOString() })}
        addLabel="Add answer"
        itemName="answer"
        icon={<MessageSquareText />}
        summary={(a) => ({ title: a.label, subtitle: a.answer.replace(/\s+/g, ' ').slice(0, 120) })}
        empty={{ title: 'No saved answers yet', description: 'Answers you write or generate in the side panel can be saved here and reused automatically.' }}
        render={(a, update) => (
          <>
            <TextField label="Question" value={a.label} placeholder="Why do you want to work here?" onChange={(v) => update({ label: v, updatedAt: new Date().toISOString() })} />
            <TextField label="Answer" multiline value={a.answer} onChange={(v) => update({ answer: v, updatedAt: new Date().toISOString() })} />
          </>
        )}
      />
    </SectionCard>
  );
}

