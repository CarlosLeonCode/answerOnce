import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Check, ChevronRight, CircleAlert, Cloud, FileText, HardDrive, Info, ScanText, Send, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { extractProfileFromCv, readCvText, saveCvImport, type CvExtractionResult } from '../../../application/cv-import';
import { applyMerge, buildMergePlan, countAccepted, defaultDecisions, type MergeDecisions, type MergePlan } from '../../../domain/cv-merge';
import type { AiSettings, Profile } from '../../../domain/profile';
import { createLlmProvider } from '../../../infrastructure/llm';
import { CV_ACCEPT } from '../../../infrastructure/text-extraction';
import type { DocumentFile } from '../../../ports/document-text-extractor';
import { Callout, ChoiceCard, Dialog, formatSize, SectionCard, Spinner } from '../../shared/components';
import { textExtractor } from '../../shared/container';
import { CLOUD_PROVIDERS, hasOrigins, isProviderReady, PROVIDER_HOSTS, PROVIDER_NAMES, providerOrigins, requestOrigins } from '../../shared/permissions';
import { useToast } from '../../shared/toast';
import { errorMessage, type VaultApi } from '../../shared/use-vault';
import { ProviderFields } from '../AiSection';
import { ReviewMerge } from './ReviewMerge';

type Method = 'ai' | 'basic';

type Stage =
  | { step: 'upload' }
  | { step: 'reading'; fileName: string }
  | { step: 'method'; file: DocumentFile; text: string }
  | { step: 'extracting'; file: DocumentFile; text: string; method: Method }
  | { step: 'review'; file: DocumentFile; text: string; result: CvExtractionResult; plan: MergePlan; decisions: MergeDecisions };

const STEPS = ['Upload', 'Extract', 'Review'] as const;

function Stepper({ index }: { index: number }) {
  return (
    <ol className="stepper" aria-label="Import progress">
      {STEPS.map((label, i) => (
        <li key={label} data-state={i < index ? 'done' : i === index ? 'current' : 'todo'} aria-current={i === index ? 'step' : undefined}>
          {i > 0 && <span className="sep" aria-hidden="true" />}
          <span className="step-num">{i < index ? <Check aria-hidden="true" /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function friendlyLlmError(error: unknown, ai: AiSettings): string {
  const msg = errorMessage(error);
  if (ai.provider === 'ollama' && /403|network error|failed to fetch/i.test(msg)) {
    return `${msg}. Is Ollama running and started with OLLAMA_ORIGINS=chrome-extension://* ?`;
  }
  if (/401|403/.test(msg)) return `${msg}. Check the API key.`;
  return msg;
}

export function CvImportPage(props: { vault: VaultApi; profile: Profile; baseRevision: number; onImported: (profile: Profile) => void; onDone: () => void }) {
  const { vault, profile } = props;
  const notify = useToast();
  const [stage, setStage] = useState<Stage>({ step: 'upload' });
  const [ai, setAi] = useState<AiSettings>(profile.ai);
  const [method, setMethod] = useState<Method>(profile.ai.provider !== 'none' ? 'ai' : 'basic');
  const [editingProvider, setEditingProvider] = useState(profile.ai.provider === 'none');
  const [granted, setGranted] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeFile, setStoreFile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const aiReady = ai.provider !== 'none' && isProviderReady(ai);
  const isCloud = CLOUD_PROVIDERS.has(ai.provider);
  const providerName = PROVIDER_NAMES[ai.provider];

  useEffect(() => {
    let alive = true;
    void hasOrigins(providerOrigins(ai)).then((ok) => alive && setGranted(ok));
    return () => {
      alive = false;
    };
  }, [ai.provider, ai.ollamaBaseUrl]);

  useEffect(() => () => abort.current?.abort(), []);

  const pickFile = async (file: File) => {
    setError(null);
    setStage({ step: 'reading', fileName: file.name });
    try {
      const doc: DocumentFile = { fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
      const text = await readCvText(textExtractor, doc);
      setStage({ step: 'method', file: doc, text });
    } catch (e) {
      setError(errorMessage(e));
      setStage({ step: 'upload' });
    }
  };

  const extract = async (file: DocumentFile, text: string, how: Method) => {
    setError(null);
    setStage({ step: 'extracting', file, text, method: how });
    abort.current = new AbortController();
    try {
      const llm = how === 'ai' ? createLlmProvider(ai) : null;
      const result = await extractProfileFromCv(text, llm, abort.current.signal);
      const plan = buildMergePlan(profile, result.extraction);
      setStage({ step: 'review', file, text, result, plan, decisions: defaultDecisions(plan, 'fill-empty') });
    } catch (e) {
      if (abort.current?.signal.aborted) setError(null);
      else setError(friendlyLlmError(e, ai));
      setStage({ step: 'method', file, text });
    } finally {
      abort.current = null;
    }
  };

  /** Requests the host permission (needs the click's user gesture) before calling the provider. */
  const withPermission = (then: () => void) => {
    const request = granted ? Promise.resolve(true) : requestOrigins(providerOrigins(ai));
    request.then(
      (ok) => {
        if (!ok) return setError(`AnswerOnce needs permission to reach ${PROVIDER_HOSTS[ai.provider]} to use ${providerName}.`);
        setGranted(true);
        then();
      },
      (e: unknown) => setError(`${errorMessage(e)}. Only localhost:11434 and 127.0.0.1:11434 can be granted for Ollama.`),
    );
  };

  const start = (file: DocumentFile, text: string) => {
    if (method === 'basic') return void extract(file, text, 'basic');
    if (ai.provider === 'none') return setError('Choose an AI provider, or use basic extraction.');
    if (!aiReady) return setError(`Enter your ${providerName} API key first.`);
    if (isCloud) return setConsentOpen(true);
    withPermission(() => void extract(file, text, 'ai'));
  };

  const save = async (s: Extract<Stage, { step: 'review' }>) => {
    setSaving(true);
    try {
      const merged = applyMerge(profile, s.plan, s.decisions);
      const next = s.result.method === 'ai' ? { ...merged, ai } : merged;
      const session = await saveCvImport(await vault.withDeps(), { profile: next, cv: storeFile ? s.file : null, baseRevision: props.baseRevision });
      props.onImported(session.profile);
      const n = countAccepted(s.plan, s.decisions);
      notify('success', 'Profile updated from your CV', `${n} ${n === 1 ? 'change' : 'changes'} saved${storeFile ? ' · CV stored as default resume' : ''}.`);
      props.onDone();
    } catch (e) {
      notify('error', 'Could not save the import', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const stepIndex = stage.step === 'upload' || stage.step === 'reading' ? 0 : stage.step === 'review' ? 2 : 1;
  const errorBox = error && (
    <Callout tone="danger" icon={<CircleAlert aria-hidden="true" />} role="alert">
      {error}
    </Callout>
  );

  if (stage.step === 'review') {
    return (
      <div className="stack-lg">
        <Stepper index={2} />
        <ReviewMerge
          plan={stage.plan}
          decisions={stage.decisions}
          introIcon={stage.result.method === 'ai' ? <Sparkles aria-hidden="true" /> : <Info aria-hidden="true" />}
          intro={
            stage.result.method === 'ai'
              ? `Structured by ${providerName} from ${stage.file.fileName}. AI can make mistakes: check each value.`
              : `Basic extraction from ${stage.file.fileName}: contact details and links only. Add experience and education yourself, or try AI.`
          }
          emptyText="Nothing new was found: your profile already contains everything extracted from this CV. You can still store the file as your resume."
          file={{ name: stage.file.fileName, store: storeFile, onStore: setStoreFile }}
          saving={saving}
          saveLabel={(n) => `Save ${n} ${n === 1 ? 'change' : 'changes'} to profile`}
          onDecisions={(decisions) => setStage({ ...stage, decisions })}
          onBack={() => setStage({ step: 'method', file: stage.file, text: stage.text })}
          onSave={() => void save(stage)}
        />
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <Stepper index={stepIndex} />
      {errorBox}

      {(stage.step === 'upload' || stage.step === 'reading') && (
        <SectionCard title="Upload your CV" description="The text is read locally in your browser. Nothing is sent anywhere at this step.">
          <label
            className={`dropzone${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void pickFile(file);
            }}
            style={{ padding: '44px 20px' }}
          >
            <span className="icon-tile" aria-hidden="true">
              {stage.step === 'reading' ? <Spinner /> : <Upload />}
            </span>
            <strong>{stage.step === 'reading' ? `Reading ${stage.fileName}…` : 'Drop your CV here or click to browse'}</strong>
            <span>PDF, DOCX, TXT or Markdown · up to 10 MB</span>
            <input
              type="file"
              aria-label="Choose CV file"
              accept={CV_ACCEPT}
              disabled={stage.step === 'reading'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickFile(file);
              }}
            />
          </label>
        </SectionCard>
      )}

      {(stage.step === 'method' || stage.step === 'extracting') && (
        <div className="file-chip">
          <span className="icon-tile neutral" aria-hidden="true">
            <FileText />
          </span>
          <div className="titles">
            <span className="item-title">{stage.file.fileName}</span>
            <span className="item-sub">
              {formatSize(stage.file.bytes.byteLength)} · {stage.text.length.toLocaleString()} characters read locally
            </span>
          </div>
          <span className="badge success">
            <Check aria-hidden="true" />
            Text extracted
          </span>
          <button type="button" className="sm" disabled={stage.step === 'extracting'} onClick={() => setStage({ step: 'upload' })}>
            Change file
          </button>
        </div>
      )}

      {stage.step === 'method' && (
        <>
          <details className="disclosure">
            <summary>
              <ChevronRight aria-hidden="true" />
              Show the extracted text
            </summary>
            <pre>{stage.text}</pre>
          </details>
          <SectionCard
            title="How should AnswerOnce structure it?"
            description="AI gets the most out of your CV. Basic extraction never leaves your computer."
            footer={
              <>
                <span className="spacer" />
                <button type="button" className="primary" onClick={() => start(stage.file, stage.text)}>
                  {method === 'ai' ? <WandSparkles aria-hidden="true" /> : <ScanText aria-hidden="true" />}
                  {method === 'ai' ? (ai.provider === 'none' ? 'Extract with AI' : `Extract with ${providerName}`) : 'Extract basic details'}
                </button>
              </>
            }
          >
            <div className="choice-list" role="radiogroup" aria-label="Extraction method">
              <ChoiceCard
                name="method"
                checked={method === 'ai'}
                onSelect={() => setMethod('ai')}
                title={
                  <>
                    <Sparkles aria-hidden="true" style={{ color: 'var(--accent)' }} />
                    Structure with AI
                    <span className="badge primary">Recommended</span>
                  </>
                }
                description="Experience, education, skills, summary, contact details and links."
              >
                {!editingProvider && ai.provider !== 'none' ? (
                  <div className="row">
                    <span className={`badge ${isCloud ? '' : 'success'}`}>
                      {isCloud ? <Cloud aria-hidden="true" /> : <HardDrive aria-hidden="true" />}
                      {isCloud ? 'Cloud' : 'Local'}
                    </span>
                    <span className="small" style={{ flex: 1, minWidth: 200 }}>
                      Using <strong>{providerName}</strong>
                      {isCloud ? ` (${PROVIDER_HOSTS[ai.provider]}). You confirm before the CV is sent.` : ' on your computer. The text stays local.'}
                    </span>
                    <button type="button" className="link" onClick={() => setEditingProvider(true)}>
                      Change provider
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="small muted">Choose a provider. These settings are saved to settings.json in your profile folder with the import.</span>
                    <ProviderFields ai={ai} onChange={setAi} name="import-provider" />
                  </>
                )}
              </ChoiceCard>
              <ChoiceCard
                name="method"
                checked={method === 'basic'}
                onSelect={() => setMethod('basic')}
                title={
                  <>
                    <ScanText aria-hidden="true" style={{ color: 'var(--muted)' }} />
                    Basic extraction
                    <span className="badge success">
                      <HardDrive aria-hidden="true" />
                      No AI, fully local
                    </span>
                  </>
                }
                description="Finds your name, email, phone and profile links. You add experience and education yourself."
              />
            </div>
          </SectionCard>
        </>
      )}

      {stage.step === 'extracting' && (
        <section className="card extracting" aria-live="polite" aria-busy="true">
          <span className="icon-tile" aria-hidden="true">
            <Spinner />
          </span>
          <h2>{stage.method === 'ai' ? `Structuring your CV with ${providerName}…` : 'Extracting details…'}</h2>
          <p className="muted small">{stage.method === 'ai' ? 'This usually takes 10–60 seconds, longer with local models.' : 'One moment.'}</p>
          {stage.method === 'ai' && (
            <button type="button" className="sm" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          )}
        </section>
      )}

      {stage.step === 'method' && (
        <Dialog open={consentOpen} onClose={() => setConsentOpen(false)} labelledBy="consent-title">
          <div className="dialog-body">
            <div className="dialog-head">
              <span className="icon-tile" aria-hidden="true">
                <Cloud />
              </span>
              <div className="titles">
                <h2 id="consent-title">Send your CV to {providerName}?</h2>
                <p>Please confirm before anything leaves your computer.</p>
              </div>
            </div>
            <ul className="facts">
              <li>
                The <strong>full text of your CV</strong> ({stage.text.length.toLocaleString()} characters), including your contact details, will be sent to{' '}
                <strong>{providerName}</strong> ({PROVIDER_HOSTS[ai.provider]}) using your API key.
              </li>
              <li>{providerName}’s own data and retention policies apply to that request.</li>
              <li>Nothing else from your profile is sent. You review the result before it is saved.</li>
            </ul>
            <Callout icon={<HardDrive aria-hidden="true" />}>Prefer to keep it on your computer? Use Ollama (local) or basic extraction.</Callout>
          </div>
          <div className="dialog-foot">
            <button type="button" className="ghost" onClick={() => setConsentOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConsentOpen(false);
                setMethod('basic');
                void extract(stage.file, stage.text, 'basic');
              }}
            >
              Use basic extraction
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setConsentOpen(false);
                withPermission(() => void extract(stage.file, stage.text, 'ai'));
              }}
            >
              <Send aria-hidden="true" />
              Send to {providerName}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
