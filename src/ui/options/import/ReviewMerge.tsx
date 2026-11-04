import type { ReactNode } from 'react';
import { ArrowLeft, Briefcase, Check, CircleAlert, GraduationCap, MessageSquareText, Save, Trash2 } from 'lucide-react';
import {
  countAccepted,
  defaultDecisions,
  planSize,
  setAllDecisions,
  type ListMergeItem,
  type MergeDecisions,
  type MergeMode,
  type MergePlan,
  type ScalarMergeField,
} from '../../../domain/cv-merge';
import { Callout, SectionCard, Segmented, Spinner, Switch } from '../../shared/components';

/**
 * Review screen shared by the CV import and agent proposals: per-field
 * accept/edit, fill-empty vs overwrite, list items, saved answers and removals.
 */
interface Props {
  plan: MergePlan;
  decisions: MergeDecisions;
  onDecisions: (decisions: MergeDecisions) => void;
  /** Callout at the top: where the values come from. */
  intro: ReactNode;
  introIcon: ReactNode;
  /** Shown when the plan has no changes. */
  emptyText: string;
  /** Column header for incoming values, e.g. "From your CV". */
  incomingLabel?: string;
  /** Accessible name suffix of the incoming value inputs, e.g. "Email from CV". */
  inputSuffix?: string;
  /** Optional file to store as the default resume. */
  file?: { name: string; store: boolean; onStore: (value: boolean) => void };
  saving: boolean;
  saveLabel: (accepted: number) => string;
  onSave: () => void;
  onBack?: () => void;
  /** Extra buttons in the footer (e.g. "Reject proposal"). */
  actions?: ReactNode;
}

const FIELD_LABELS: Record<string, string> = {
  company: 'Company',
  title: 'Title',
  location: 'Location',
  startDate: 'Start',
  endDate: 'End',
  current: 'Current role',
  description: 'Description',
  school: 'School',
  degree: 'Degree',
  field: 'Field',
};

function patchSummary(patch: object): string {
  return Object.entries(patch)
    .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v) || '(empty)'}`)
    .join(' · ');
}

function ItemBadge({ entry }: { entry: ListMergeItem<object> }) {
  if (entry.patch) return <span className="badge warning">Updates existing</span>;
  return entry.duplicateOf ? <span className="badge">Merges with existing</span> : <span className="badge success">New</span>;
}

const range = (a: string, b: string, current?: boolean) => [a, current ? 'Present' : b].filter(Boolean).join(' – ');

function FieldRow({ field, decisions, onDecisions, inputSuffix }: { field: ScalarMergeField; decisions: MergeDecisions; onDecisions: (d: MergeDecisions) => void; inputSuffix: string }) {
  const d = decisions.fields[field.key] ?? { accept: false, value: field.incoming };
  const set = (patch: Partial<typeof d>) => onDecisions({ ...decisions, fields: { ...decisions.fields, [field.key]: { ...d, ...patch } } });
  const id = `merge-${field.key}`;
  const overwrites = d.accept && field.current.trim() !== '';
  return (
    <div className={`review-row${d.accept ? '' : ' off'}`}>
      <input type="checkbox" id={`${id}-accept`} checked={d.accept} aria-label={`Use the new value for ${field.label}`} onChange={(e) => set({ accept: e.target.checked })} />
      <label className="rlabel" htmlFor={`${id}-accept`}>
        {field.label}
        {overwrites && <span className="badge warning">Replaces current</span>}
      </label>
      <div className={`rcurrent${field.current ? '' : ' is-empty'}`} title={field.current}>
        {field.current || 'Empty'}
      </div>
      <div className="rincoming">
        {field.multiline ? (
          <textarea id={id} aria-label={`${field.label} ${inputSuffix}`} value={d.value} onChange={(e) => set({ value: e.target.value, accept: true })} />
        ) : (
          <input id={id} aria-label={`${field.label} ${inputSuffix}`} value={d.value} onChange={(e) => set({ value: e.target.value, accept: true })} />
        )}
      </div>
    </div>
  );
}

export function ReviewMerge(props: Props) {
  const { plan, decisions, onDecisions } = props;
  const sections = [...new Set(plan.fields.map((f) => f.section))];
  const accepted = countAccepted(plan, decisions);
  const total = planSize(plan);
  const setMode = (mode: MergeMode) => onDecisions(defaultDecisions(plan, mode));
  const incomingLabel = props.incomingLabel ?? 'From your CV';
  const updates = plan.experience.some((e) => e.patch) || plan.education.some((e) => e.patch);

  return (
    <>
      <Callout tone="info" icon={props.introIcon}>
        <span>
          {props.intro} Unchanged values are hidden.
        </span>
      </Callout>

      <div className="review-toolbar">
        <Segmented
          label="Merge mode"
          value={decisions.mode}
          onChange={setMode}
          options={[
            { value: 'fill-empty', label: 'Fill empty fields only' },
            { value: 'overwrite', label: 'Overwrite existing' },
          ]}
        />
        <div className="row">
          <button type="button" className="sm" onClick={() => onDecisions(setAllDecisions(plan, decisions, true))}>
            <Check aria-hidden="true" />
            Accept all
          </button>
          <button type="button" className="sm ghost" onClick={() => onDecisions(setAllDecisions(plan, decisions, false))}>
            Clear selection
          </button>
        </div>
      </div>

      {total === 0 && <Callout icon={<CircleAlert aria-hidden="true" />}>{props.emptyText}</Callout>}

      {sections.map((section) => (
        <section key={section} className="card section-card" aria-label={section}>
          <header className="section-head">
            <div className="titles">
              <h2>{section}</h2>
            </div>
          </header>
          <div className="review-rows">
            <div className="review-row head" aria-hidden="true">
              <span />
              <span>Field</span>
              <span>Current</span>
              <span>{incomingLabel}</span>
            </div>
            {plan.fields
              .filter((f) => f.section === section)
              .map((f) => (
                <FieldRow key={f.key} field={f} decisions={decisions} onDecisions={onDecisions} inputSuffix={props.inputSuffix ?? 'from CV'} />
              ))}
          </div>
        </section>
      ))}

      {plan.experience.length > 0 && (
        <section className="card section-card" aria-label="Experience">
          <header className="section-head">
            <span className="icon-tile neutral" aria-hidden="true">
              <Briefcase />
            </span>
            <div className="titles">
              <h2>Experience</h2>
              <p>
                {plan.experience.length} {plan.experience.length === 1 ? 'role' : 'roles'}. Matching roles are merged into the existing entry
                {updates ? '; updates replace only the fields shown' : ''}.
              </p>
            </div>
          </header>
          <div className="review-items">
            {plan.experience.map((entry) => {
              const { id, item } = entry;
              return (
                <label key={id} className={`review-item${decisions.experience[id] ? '' : ' off'}`}>
                  <input type="checkbox" checked={decisions.experience[id] ?? false} onChange={(e) => onDecisions({ ...decisions, experience: { ...decisions.experience, [id]: e.target.checked } })} />
                  <div className="titles">
                    <strong>{[item.title, item.company].filter(Boolean).join(' · ')}</strong>
                    <span>{[range(item.startDate, item.endDate, item.current), item.location].filter(Boolean).join(' · ') || 'No dates'}</span>
                    {entry.patch ? <span className="desc">Changes: {patchSummary(entry.patch)}</span> : item.description && <span className="desc">{item.description}</span>}
                  </div>
                  <ItemBadge entry={entry} />
                </label>
              );
            })}
          </div>
        </section>
      )}

      {plan.education.length > 0 && (
        <section className="card section-card" aria-label="Education">
          <header className="section-head">
            <span className="icon-tile neutral" aria-hidden="true">
              <GraduationCap />
            </span>
            <div className="titles">
              <h2>Education</h2>
              <p>{plan.education.length} found.</p>
            </div>
          </header>
          <div className="review-items">
            {plan.education.map((entry) => {
              const { id, item } = entry;
              return (
                <label key={id} className={`review-item${decisions.education[id] ? '' : ' off'}`}>
                  <input type="checkbox" checked={decisions.education[id] ?? false} onChange={(e) => onDecisions({ ...decisions, education: { ...decisions.education, [id]: e.target.checked } })} />
                  <div className="titles">
                    <strong>{item.school || item.degree}</strong>
                    <span>{[[item.degree, item.field].filter(Boolean).join(' in '), range(item.startDate, item.endDate)].filter(Boolean).join(' · ')}</span>
                    {entry.patch && <span className="desc">Changes: {patchSummary(entry.patch)}</span>}
                  </div>
                  <ItemBadge entry={entry} />
                </label>
              );
            })}
          </div>
        </section>
      )}

      {plan.skills.length > 0 && (
        <SectionCard title="Skills" description={`${plan.skills.length} new skills. Click to include or exclude.`}>
          <div className="chips" role="group" aria-label="Skills to add">
            {plan.skills.map((skill) => {
              const on = decisions.skills[skill] ?? false;
              return (
                <button key={skill} type="button" className="chip" aria-pressed={on} onClick={() => onDecisions({ ...decisions, skills: { ...decisions.skills, [skill]: !on } })}>
                  {on && <Check aria-hidden="true" />}
                  {skill}
                </button>
              );
            })}
          </div>
        </SectionCard>
      )}

      {plan.answers.length > 0 && (
        <section className="card section-card" aria-label="Saved answers">
          <header className="section-head">
            <span className="icon-tile neutral" aria-hidden="true">
              <MessageSquareText />
            </span>
            <div className="titles">
              <h2>Saved answers</h2>
              <p>Reused when an application asks a similar question.</p>
            </div>
          </header>
          <div className="review-items">
            {plan.answers.map((a) => (
              <label key={a.id} className={`review-item${decisions.answers[a.id] ? '' : ' off'}`}>
                <input type="checkbox" checked={decisions.answers[a.id] ?? false} onChange={(e) => onDecisions({ ...decisions, answers: { ...decisions.answers, [a.id]: e.target.checked } })} />
                <div className="titles">
                  <strong>{a.label}</strong>
                  <span className="desc">{a.answer}</span>
                </div>
                {a.current ? <span className="badge warning">Replaces current answer</span> : <span className="badge success">New</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      {plan.removals.length > 0 && (
        <section className="card section-card" aria-label="Removals">
          <header className="section-head">
            <span className="icon-tile neutral" aria-hidden="true">
              <Trash2 />
            </span>
            <div className="titles">
              <h2>Removals</h2>
              <p>Checked items are deleted from your profile.</p>
            </div>
          </header>
          <div className="review-items">
            {plan.removals.map((r) => (
              <label key={r.key} className={`review-item${decisions.removals[r.key] ? '' : ' off'}`}>
                <input type="checkbox" checked={decisions.removals[r.key] ?? false} onChange={(e) => onDecisions({ ...decisions, removals: { ...decisions.removals, [r.key]: e.target.checked } })} />
                <div className="titles">
                  <strong>{r.label}</strong>
                  <span>{{ experience: 'Role', education: 'Education entry', skill: 'Skill', answer: 'Saved answer' }[r.kind]}</span>
                </div>
                <span className="badge danger">Removes</span>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="review-foot">
        {props.file && (
          <div className="row-nowrap" style={{ flex: 1, minWidth: 220 }}>
            <Switch checked={props.file.store} onChange={props.file.onStore} label="Keep the CV file in your profile folder as default resume" />
            <span className="small">
              Keep <strong>{props.file.name}</strong> in your profile folder as your default resume
            </span>
          </div>
        )}
        {!props.file && <span className="spacer" />}
        {props.onBack && (
          <button type="button" className="ghost" onClick={props.onBack} disabled={props.saving}>
            <ArrowLeft aria-hidden="true" />
            Back
          </button>
        )}
        {props.actions}
        <button type="button" className="primary" onClick={props.onSave} disabled={props.saving || (accepted === 0 && !props.file?.store)}>
          {props.saving ? <Spinner /> : <Save aria-hidden="true" />}
          {props.saving ? 'Saving…' : props.saveLabel(accepted)}
        </button>
      </div>
    </>
  );
}
