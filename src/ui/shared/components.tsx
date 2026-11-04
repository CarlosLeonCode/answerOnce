import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import { useToast } from './toast';
import { errorMessage } from './use-vault';

/** Brand lockup used in the options sidebar, auth screens and the side panel. */
export function Brand(props: { size?: 'md' | 'lg'; tagline?: string }) {
  return (
    <div className={`brand${props.size === 'lg' ? ' lg' : ''}`}>
      <img className="brand-mark" src="/icon/128.png" alt="" />
      <div className="stack-sm" style={{ gap: 0, minWidth: 0 }}>
        <span className="brand-name">AnswerOnce</span>
        {props.tagline && <span className="brand-tagline">{props.tagline}</span>}
      </div>
    </div>
  );
}

export function Spinner() {
  return <LoaderCircle className="spin" aria-hidden="true" />;
}

export function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      type="button"
      role="switch"
      id={props.id}
      className="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

/** Label + description on the left, switch on the right. */
export function SwitchRow(props: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-text">
        <label htmlFor={id} className="field-label" style={{ cursor: 'pointer' }}>
          {props.label}
        </label>
        {props.description && <span className="field-hint">{props.description}</span>}
      </div>
      <Switch id={id} checked={props.checked} onChange={props.onChange} label={props.label} disabled={props.disabled} />
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  block?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={props.label} className={`segmented${props.block ? ' block' : ''}`}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Yes / No / Not set as a segmented control. */
export function TriState(props: { label: string; hint?: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  const current = props.value === null ? 'unset' : props.value ? 'yes' : 'no';
  return (
    <div className="field">
      <span className="field-label">{props.label}</span>
      <Segmented
        label={props.label}
        value={current}
        block
        options={[
          { value: 'unset', label: 'Ask me' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => props.onChange(v === 'unset' ? null : v === 'yes')}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  autoComplete?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  rows?: number;
}) {
  const id = useId();
  const { label, value, onChange, type = 'text', placeholder, multiline, autoComplete = 'off', hint } = props;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${props.className ? ` ${props.className}` : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {props.optional && <span className="field-optional">Optional</span>}
      </label>
      {multiline ? (
        <textarea id={id} rows={props.rows} value={value} placeholder={placeholder} aria-describedby={hintId} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} aria-describedby={hintId} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  );
}

export function SectionCard(props: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; icon?: ReactNode }) {
  return (
    <section className="card section-card">
      <header className="section-head">
        {props.icon && <span className="icon-tile neutral">{props.icon}</span>}
        <div className="titles">
          <h2>{props.title}</h2>
          {props.description && <p>{props.description}</p>}
        </div>
        {props.actions && <div className="row">{props.actions}</div>}
      </header>
      <div className="section-body">{props.children}</div>
      {props.footer && <footer className="section-foot">{props.footer}</footer>}
    </section>
  );
}

export function EmptyState(props: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        {props.icon}
      </span>
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.children && <div className="row">{props.children}</div>}
    </div>
  );
}

export function Callout(props: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon: ReactNode; children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className={`callout ${props.tone ?? ''}`} role={props.role}>
      {props.icon}
      <div className="callout-body">{props.children}</div>
    </div>
  );
}

export function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" role="img" aria-label={`${label}: ${percent}%`}>
      <svg viewBox="0 0 112 112" aria-hidden="true">
        <circle className="track" cx="56" cy="56" r={r} fill="none" strokeWidth="10" />
        <circle className="value" cx="56" cy="56" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <div className="label" aria-hidden="true">
        <div>
          <strong>{percent}%</strong>
          <span>complete</span>
        </div>
      </div>
    </div>
  );
}

/** Radio option rendered as a card, with optional content shown when selected. */
export function ChoiceCard(props: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="choice">
      <label className="choice-main">
        <input type="radio" name={props.name} checked={props.checked} onChange={props.onSelect} />
        <div className="titles">
          <strong>{props.title}</strong>
          <span>{props.description}</span>
        </div>
      </label>
      {props.checked && props.children && <div className="choice-extra">{props.children}</div>}
    </div>
  );
}

/** Preformatted snippet with a copy button. */
export function CodeBlock(props: { code: string; label: string }) {
  const notify = useToast();
  const copy = () =>
    navigator.clipboard.writeText(props.code).then(
      () => notify('success', 'Copied to clipboard', props.label),
      (e: unknown) => notify('error', 'Could not copy', errorMessage(e)),
    );
  return (
    <div className="code-block">
      <pre aria-label={props.label}>
        <code>{props.code}</code>
      </pre>
      <button type="button" className="sm" aria-label={`Copy ${props.label}`} onClick={() => void copy()}>
        <Copy aria-hidden="true" />
        Copy
      </button>
    </div>
  );
}

/** Accessible tabs (arrow keys move between them), styled like the segmented control. */
export function Tabs<T extends string>(props: { label: string; value: T; tabs: readonly { value: T; label: string; panel: ReactNode }[]; onChange: (value: T) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, props.tabs.findIndex((t) => t.value === props.value));
  const move = (to: number) => {
    const next = (to + props.tabs.length) % props.tabs.length;
    props.onChange(props.tabs[next]!.value);
    refs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') move(index + 1);
    else if (e.key === 'ArrowLeft') move(index - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(props.tabs.length - 1);
    else return;
    e.preventDefault();
  };
  const current = props.tabs[index]!;
  return (
    <div className="stack">
      <div role="tablist" aria-label={props.label} className="segmented tabs" onKeyDown={onKey}>
        {props.tabs.map((t, i) => (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.value}`}
            aria-selected={i === index}
            aria-controls={`${id}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => props.onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current.value}`} className="stack">
        {current.panel}
      </div>
    </div>
  );
}

/** Native modal dialog: focus trap, Escape and backdrop handled by the browser. */
export function Dialog(props: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={props.labelledBy} onClose={props.onClose} onCancel={props.onClose}>
      {props.open && props.children}
    </dialog>
  );
}

/** Runs an async action with busy + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function initials(first: string, last: string): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || '?';
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "Oct 3" for dates in the current year, "Oct 3, 2025" otherwise. Empty for invalid dates. */
export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
