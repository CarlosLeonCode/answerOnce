import { useState } from 'react';
import { Bot, CircleAlert, CircleCheck, Cloud, HardDrive, Info, PlugZap } from 'lucide-react';
import { generateAnswer } from '../../application/answers';
import type { AiSettings, LlmProviderId, Profile } from '../../domain/profile';
import { createLlmProvider, DEFAULT_MODELS } from '../../infrastructure/llm';
import { Callout, ChoiceCard, SectionCard, Spinner, TextField } from '../shared/components';
import { providerOrigins, requestOrigins } from '../shared/permissions';
import { errorMessage } from '../shared/use-vault';
import type { SectionProps } from './ProfileSections';

const PROVIDERS: { id: Exclude<LlmProviderId, 'none'>; name: string; local: boolean; blurb: string }[] = [
  { id: 'ollama', name: 'Ollama', local: true, blurb: 'Runs on your computer. Nothing leaves your machine.' },
  { id: 'openai', name: 'OpenAI', local: false, blurb: 'GPT models with your own API key.' },
  { id: 'gemini', name: 'Google Gemini', local: false, blurb: 'Gemini models with your own API key.' },
  { id: 'claude', name: 'Anthropic Claude', local: false, blurb: 'Claude models with your own API key.' },
];

/** Provider picker + model/key/URL fields. Shared by Settings → AI and the CV import flow. */
export function ProviderFields(props: { ai: AiSettings; onChange: (ai: AiSettings) => void; allowNone?: boolean; onStatus?: (s: Status) => void; name?: string }) {
  const { ai, onChange } = props;
  const set = (patch: Partial<AiSettings>) => onChange({ ...ai, ...patch });
  const pick = (provider: LlmProviderId) => {
    const next = { ...ai, provider, model: provider === ai.provider ? ai.model : '' };
    onChange(next);
    if (provider === 'none') return;
    // Must run synchronously inside the click (user gesture).
    requestOrigins(providerOrigins(next))
      .then((granted) => props.onStatus?.(granted ? { ok: true, text: 'Network access to the provider granted.' } : { ok: false, text: 'Permission denied: AI calls will fail until you grant it.' }))
      .catch((e: unknown) => props.onStatus?.({ ok: false, text: errorMessage(e) }));
  };
  const options = props.allowNone ? [{ id: 'none' as const, name: 'No AI', local: true, blurb: 'Everything is filled from your profile and saved answers only.' }, ...PROVIDERS] : PROVIDERS;
  const groupName = props.name ?? 'ai-provider';
  return (
    <div className="stack-lg">
      <div className="choice-list" role="radiogroup" aria-label="AI provider">
        {options.map((p) => (
          <ChoiceCard
            key={p.id}
            name={groupName}
            checked={ai.provider === p.id}
            onSelect={() => pick(p.id)}
            description={p.blurb}
            title={
              <>
                {p.name}
                {p.id !== 'none' &&
                  (p.local ? (
                    <span className="badge success">
                      <HardDrive aria-hidden="true" />
                      Local
                    </span>
                  ) : (
                    <span className="badge">
                      <Cloud aria-hidden="true" />
                      Cloud
                    </span>
                  ))}
              </>
            }
          />
        ))}
      </div>
      {ai.provider !== 'none' && (
        <div className="grid">
          <TextField label="Model" value={ai.model} placeholder={DEFAULT_MODELS[ai.provider]} hint={`Leave empty for ${DEFAULT_MODELS[ai.provider]}.`} onChange={(v) => set({ model: v })} />
          {ai.provider === 'ollama' ? (
            <TextField label="Ollama URL" type="url" value={ai.ollamaBaseUrl} onChange={(v) => set({ ollamaBaseUrl: v })} hint="Only localhost:11434 or 127.0.0.1:11434 can be granted." />
          ) : (
            <TextField label="API key" type="password" value={ai.apiKey} onChange={(v) => set({ apiKey: v })} hint="Stored in settings.json in your profile folder. AI agents never read it." />
          )}
        </div>
      )}
      {ai.provider === 'ollama' && (
        <Callout tone="info" icon={<Info aria-hidden="true" />}>
          <span>
            Ollama rejects browser extensions by default. Start it with <code>OLLAMA_ORIGINS=chrome-extension://* ollama serve</code>.
          </span>
        </Callout>
      )}
    </div>
  );
}

export interface Status {
  ok: boolean;
  text: string;
}

export function AiSection({ profile, onChange }: SectionProps) {
  const ai = profile.ai;
  const [status, setStatus] = useState<Status | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const llm = createLlmProvider(ai);
      if (!llm) throw new Error('Choose a provider first.');
      const answer = await generateAnswer(llm, { question: 'Reply with the single word: OK', jobDescription: '', profile });
      setStatus({ ok: true, text: `The provider answered: “${answer.slice(0, 80)}”` });
    } catch (e) {
      setStatus({ ok: false, text: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SectionCard
        title="Provider"
        icon={<Bot />}
        description="Optional. Drafts answers to open questions (when you click “Generate with AI”) and structures your CV on import."
        footer={
          ai.provider !== 'none' && (
            <>
              <button type="button" onClick={() => requestOrigins(providerOrigins(ai)).then((g) => setStatus(g ? { ok: true, text: 'Permission granted.' } : { ok: false, text: 'Permission denied.' }), (e: unknown) => setStatus({ ok: false, text: errorMessage(e) }))}>
                <PlugZap aria-hidden="true" />
                Grant network access
              </button>
              <button type="button" disabled={testing} onClick={() => void test()}>
                {testing ? <Spinner /> : <CircleCheck aria-hidden="true" />}
                Test provider
              </button>
            </>
          )
        }
      >
        <ProviderFields ai={ai} allowNone onChange={(next) => onChange({ ...profile, ai: next } satisfies Profile)} onStatus={setStatus} />
        {status && (
          <Callout tone={status.ok ? 'success' : 'danger'} icon={status.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />} role="status">
            {status.text}
          </Callout>
        )}
      </SectionCard>
      <SectionCard title="What the AI sees" description="AnswerOnce sends the minimum needed for each task.">
        <ul className="stack-sm small" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
          <li>
            <strong>Answering a question:</strong> the question, the job description and a short profile summary (first name, location, headline, skills,
            experience, education). Never your email, phone, salary, documents or API keys.
          </li>
          <li>
            <strong>Importing a CV:</strong> the full text of the CV. Cloud providers only after you confirm; with Ollama it never leaves your computer.
          </li>
        </ul>
      </SectionCard>
    </>
  );
}
