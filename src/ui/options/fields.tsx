import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash, X } from 'lucide-react';
import { EmptyState } from '../shared/components';

/** Editable list of records rendered as collapsible cards. */
export function ListEditor<T extends { id: string }>(props: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  addLabel: string;
  itemName: string;
  icon: ReactNode;
  summary: (item: T) => { title: string; subtitle?: string; badge?: ReactNode };
  render: (item: T, update: (patch: Partial<T>) => void) => ReactNode;
  empty: { title: string; description: string; extra?: ReactNode };
}) {
  const { items, onChange, create, addLabel, render, empty, summary } = props;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const add = () => {
    const item = create();
    onChange([...items, item]);
    setOpen((s) => new Set(s).add(item.id));
  };
  const addButton = (
    <button type="button" className={items.length ? '' : 'primary'} onClick={add}>
      <Plus aria-hidden="true" />
      {addLabel}
    </button>
  );

  if (items.length === 0) {
    return (
      <EmptyState icon={props.icon} title={empty.title} description={empty.description}>
        {addButton}
        {empty.extra}
      </EmptyState>
    );
  }

  return (
    <div className="stack">
      <div className="item-list">
        {items.map((item, index) => {
          const isOpen = open.has(item.id);
          const s = summary(item);
          const bodyId = `item-${item.id}`;
          return (
            <div key={item.id} className={`item-card${isOpen ? ' open' : ''}`}>
              <div className="item-head">
                <span className="icon-tile neutral" aria-hidden="true">
                  {props.icon}
                </span>
                <div className="titles">
                  <span className="item-title">{s.title || <span className="muted">Untitled {props.itemName}</span>}</span>
                  {s.subtitle && <span className="item-sub">{s.subtitle}</span>}
                </div>
                {s.badge}
                <div className="item-actions">
                  <button type="button" className="ghost icon sm" aria-label={`Move ${props.itemName} up`} disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))}>
                    <ArrowUp />
                  </button>
                  <button
                    type="button"
                    className="ghost icon sm"
                    aria-label={`Move ${props.itemName} down`}
                    disabled={index === items.length - 1}
                    onClick={() => onChange(move(items, index, index + 1))}
                  >
                    <ArrowDown />
                  </button>
                  <button type="button" className="ghost danger icon sm" aria-label={`Remove ${props.itemName}`} onClick={() => onChange(items.filter((it) => it.id !== item.id))}>
                    <Trash />
                  </button>
                  <button type="button" className="sm" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(item.id)}>
                    {isOpen ? 'Done' : 'Edit'}
                    <ChevronDown aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="item-body" id={bodyId}>
                  {render(item, (patch) => onChange(items.map((it) => (it.id === item.id ? { ...it, ...patch } : it))))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="row">{addButton}</div>
    </div>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/** Free-form tags (skills, countries). Enter or comma adds; Backspace on empty removes the last one. */
export function TagInput(props: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder?: string; hint?: string }) {
  const [text, setText] = useState('');
  const id = `tags-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const known = new Set(props.values.map((v) => v.toLowerCase()));
    const fresh = parts.filter((p) => !known.has(p.toLowerCase()));
    if (fresh.length) props.onChange([...props.values, ...fresh]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && props.values.length) {
      props.onChange(props.values.slice(0, -1));
    }
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      {props.values.length > 0 && (
        <ul className="chips plain" aria-label={props.label}>
          {props.values.map((v) => (
            <li key={v} className="tag">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => props.onChange(props.values.filter((x) => x !== v))}>
                <X />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text.trim() && add(text)}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  );
}
