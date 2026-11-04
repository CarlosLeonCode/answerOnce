import { useState } from 'react';
import { BookmarkPlus, ChevronDown, CircleAlert, CircleCheck, CornerDownLeft, FileQuestion, Sparkles } from 'lucide-react';
import { generateAnswer, rememberAnswer } from '../../application/answers';
import { fillSingleField, type UnmatchedField } from '../../application/fill-page';
import { createLlmProvider } from '../../infrastructure/llm';
import { Spinner } from '../shared/components';
import { pageGateway } from '../shared/container';
import { errorMessage, type VaultApi } from '../shared/use-vault';

const TEXT_KINDS = new Set(['text', 'textarea', 'email', 'tel', 'url', 'number', 'select', 'radio', 'combobox', 'checkbox']);
const KIND_LABEL: Record<string, string> = { textarea: 'long text', select: 'dropdown', radio: 'choice', combobox: 'dropdown', checkbox: 'checkbox', file: 'file upload' };

export function UnmatchedItem(props: { vault: VaultApi; item: UnmatchedField; tabId: number; jobText: string; onInserted?: (answer: string) => void }) {
  const { vault, item, tabId, jobText } = props;
  const { field } = item;
  const profile = vault.session!.profile;
  const [answer, setAnswer] = useState('');
  const [open, setOpen] = useState(item.openEnded);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const label = field.label || field.ariaLabel || field.placeholder || field.name || '(unlabeled field)';
  const aiEnabled = profile.ai.provider !== 'none';
  const answerable = field.kind !== 'file' && TEXT_KINDS.has(field.kind);
  const bodyId = `q-${field.uid}`;

  const act = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const generate = () =>
    act('generate', async () => {
      const llm = createLlmProvider(profile.ai);
      if (!llm) throw new Error('Choose an AI provider in Profile → AI provider.');
      const options = field.options.length ? `\nAllowed options: ${field.options.join(' | ')}` : '';
      setAnswer(await generateAnswer(llm, { question: label + options, jobDescription: jobText, profile }));
      return 'Draft ready. Review and edit it before inserting.';
    });

  const insert = () =>
    act('insert', async () => {
      const result = await fillSingleField(pageGateway, tabId, item.frameId, field, answer);
      if (result.status !== 'filled') throw new Error(`Could not insert (${result.status}). Paste it manually.`);
      props.onInserted?.(answer.trim());
      return 'Inserted into the page.';
    });

  const save = () =>
    act('save', async () => {
      await rememberAnswer(await vault.withDeps(), label, answer);
      return 'Saved. It will be reused for similar questions.';
    });

  return (
    <div className={`question${open && answerable ? ' open' : ''}`}>
      <button
        type="button"
        className="question-head"
        aria-expanded={answerable ? open : undefined}
        aria-controls={answerable ? bodyId : undefined}
        disabled={!answerable}
        style={answerable ? undefined : { opacity: 1, cursor: 'default' }}
        onClick={() => setOpen(!open)}
      >
        {answerable ? <CircleAlert aria-hidden="true" /> : <FileQuestion aria-hidden="true" style={{ color: 'var(--muted)' }} />}
        <span className="q-label">{label}</span>
        <span className="badge">{KIND_LABEL[field.kind] ?? field.kind}</span>
        {answerable && <ChevronDown className="chev" aria-hidden="true" />}
      </button>
      {answerable && open && (
        <div className="question-body" id={bodyId}>
          {field.options.length > 0 && <p className="options">Options: {field.options.slice(0, 8).join(' · ')}</p>}
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer…" aria-label={`Answer for ${label}`} />
          <div className="actions">
            {aiEnabled && (
              <button type="button" className="sm" disabled={busy !== null} onClick={() => void generate()}>
                {busy === 'generate' ? <Spinner /> : <Sparkles aria-hidden="true" />}
                {busy === 'generate' ? 'Generating…' : 'Generate with AI'}
              </button>
            )}
            <button type="button" className="sm primary" disabled={busy !== null || !answer.trim()} onClick={() => void insert()}>
              <CornerDownLeft aria-hidden="true" />
              Insert into page
            </button>
            <button type="button" className="sm ghost" disabled={busy !== null || !answer.trim()} onClick={() => void save()}>
              <BookmarkPlus aria-hidden="true" />
              Save answer
            </button>
          </div>
          {message && (
            <p className={`question-msg ${message.ok ? 'muted' : 'error'}`} role="status">
              {message.ok ? <CircleCheck aria-hidden="true" style={{ color: 'var(--success)' }} /> : <CircleAlert aria-hidden="true" />}
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
