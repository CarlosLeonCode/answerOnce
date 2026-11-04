import { useEffect, useState } from 'react';
import { Bot, ChevronRight, CircleCheck, Download, FolderPlus, Inbox, Info, MessageSquareText, ShieldCheck, TerminalSquare, TriangleAlert } from 'lucide-react';
import { addAgentConnector, hasAgentConnector } from '../../application/agent-connector';
import { setAgentDirectWrite } from '../../application/agent-proposals';
import {
  antigravityCommand,
  antigravityConfig,
  baseName,
  claudeCodeCommand,
  codexCommand,
  codexConfig,
  cursorConfig,
  looksLikeOtherFolder,
  NODE_DEFAULT,
  opencodeConfig,
  resolveAgentPaths,
  type AgentSetup,
} from '../../domain/agent-setup';
import type { Profile } from '../../domain/profile';
import { Callout, CodeBlock, SectionCard, Spinner, SwitchRow, Tabs, TextField } from '../shared/components';
import { loadPackagedConnector, mcpbDownloadUrl, vaultDeps } from '../shared/container';
import { useToast } from '../shared/toast';
import { errorMessage, type VaultApi } from '../shared/use-vault';
import type { Route } from './routes';

type AgentId = 'claude-code' | 'codex' | 'antigravity' | 'opencode' | 'cursor';

const EXAMPLE_PROMPTS = ["What's in my AnswerOnce profile?", 'Import my CV from ~/Documents/cv.pdf into AnswerOnce', 'Which companies did I apply to this week?'];

/** How to connect an AI agent to AnswerOnce (Claude Desktop first, developer tools second), plus the direct-write setting. */
export function AgentsPage(props: { profile: Profile; onChange: (profile: Profile) => void; vault: VaultApi; onNavigate: (route: Route) => void }) {
  const { profile, onChange, vault } = props;
  const notify = useToast();
  const [savingAgents, setSavingAgents] = useState(false);
  const folderName = vault.handle?.name;
  const folderLabel = folderName ? `“${folderName}”` : 'you chose in AnswerOnce';
  const directWrite = vault.session?.profile.agents.directWrite ?? false;

  const toggleDirectWrite = async (enabled: boolean) => {
    setSavingAgents(true);
    try {
      await setAgentDirectWrite(await vault.withDeps(), enabled);
      notify('success', enabled ? 'Agents can now write directly' : 'Agents propose, you review', enabled ? 'Changes from AI agents are applied without review.' : 'Changes from AI agents wait in Agent proposals.');
    } catch (err) {
      notify('error', 'Could not change the setting', errorMessage(err));
    } finally {
      setSavingAgents(false);
    }
  };

  return (
    <>
      <SectionCard title="What it is" icon={<Bot />}>
        <p className="small" style={{ color: 'var(--text-2)' }}>
          AI agents like Claude Desktop, Claude Code, Codex, Antigravity, OpenCode or Cursor can read your profile, import your CV and look up your applications.
          You review every change they suggest. They never see your AI provider settings or API keys.
        </p>
      </SectionCard>

      <SectionCard title="Claude Desktop (recommended)" icon={<Download />} description="Two clicks. No terminal needed.">
        <div>
          <a className="button primary lg" href={mcpbDownloadUrl()} download="answeronce.mcpb">
            <Download aria-hidden="true" />
            Download AnswerOnce for Claude Desktop
          </a>
        </div>
        <ol className="steps" aria-label="Claude Desktop steps">
          <li>
            <span className="step-num">1</span>
            <span>Open the downloaded file.</span>
          </li>
          <li>
            <span className="step-num">2</span>
            <span>Click Install in Claude.</span>
          </li>
          <li>
            <span className="step-num">3</span>
            <span>Choose your profile folder — it's the folder named {folderLabel}.</span>
          </li>
        </ol>
        <Callout tone="info" icon={<Info aria-hidden="true" />}>
          On a Mac, Claude may ask for access to your Documents folder (or wherever your profile folder is). Click Allow.
        </Callout>
      </SectionCard>

      <DeveloperAgents profile={profile} onChange={onChange} vault={vault} folderName={folderName} />

      <SectionCard title="Try it" icon={<MessageSquareText />} description="Ask your agent something like:">
        <ul className="stack-sm small" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
          {EXAMPLE_PROMPTS.map((p) => (
            <li key={p}>“{p}”</li>
          ))}
        </ul>
        <Callout tone="info" icon={<Inbox aria-hidden="true" />}>
          <span>Changes the agent proposes show up in Agent proposals for your review.</span>
          <div className="row" style={{ marginTop: 4 }}>
            <button type="button" className="sm" onClick={() => props.onNavigate('proposals')}>
              Open Agent proposals
            </button>
          </div>
        </Callout>
      </SectionCard>

      <SectionCard
        title="Direct write"
        icon={<ShieldCheck />}
        description="What agents read is sent to their model provider. By default they only propose changes."
      >
        <SwitchRow
          label="Let agents write directly without review"
          description="Off: agent changes wait in Agent proposals until you accept them. On: they are applied to your profile immediately. Only this page can change it."
          checked={directWrite}
          disabled={savingAgents}
          onChange={(enabled) => void toggleDirectWrite(enabled)}
        />
        {directWrite && (
          <Callout tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
            Agents can change or remove profile data without asking. Turn this off if you are not sure.
          </Callout>
        )}
      </SectionCard>
    </>
  );
}

/** Claude Code, Codex, Antigravity, OpenCode and Cursor: the connector goes into the profile folder, then one snippet with its path. */
function DeveloperAgents(props: { profile: Profile; onChange: (profile: Profile) => void; vault: VaultApi; folderName: string | undefined }) {
  const { profile, onChange, vault, folderName } = props;
  const notify = useToast();
  const [agent, setAgent] = useState<AgentId>('claude-code');
  const [connector, setConnector] = useState<'unknown' | 'missing' | 'added'>('unknown');
  const [adding, setAdding] = useState(false);
  const setup = profile.agentSetup;
  const paths = resolveAgentPaths(setup, folderName);
  const set = (patch: Partial<AgentSetup>) => onChange({ ...profile, agentSetup: { ...setup, ...patch } });
  const otherFolder = looksLikeOtherFolder(setup.profileFolder, folderName);

  // Already added earlier? Only checked when folder access needs no click.
  useEffect(() => {
    const handle = vault.handle;
    if (!handle) return;
    let alive = true;
    void (async () => {
      if ((await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')) !== 'granted') return;
      const found = await hasAgentConnector(vaultDeps(handle).storage).catch(() => false);
      if (alive) setConnector((c) => (c === 'unknown' ? (found ? 'added' : 'missing') : c));
    })();
    return () => {
      alive = false;
    };
  }, [vault.handle]);

  const addConnector = async () => {
    setAdding(true);
    try {
      const deps = await vault.withDeps(); // asks for folder access: this runs from the click
      await addAgentConnector(deps.storage, await loadPackagedConnector());
      setConnector('added');
      notify('success', 'Connector added', `It is in the .answeronce folder inside ${folderName ?? 'your profile folder'}.`);
    } catch (err) {
      notify('error', 'Could not add the connector', errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const tabs = [
    {
      value: 'claude-code' as const,
      label: 'Claude Code',
      panel: (
        <>
          <p className="small muted">Run this once in a terminal. It adds AnswerOnce to Claude Code for all your projects.</p>
          <CodeBlock label="Claude Code command" code={claudeCodeCommand(paths)} />
        </>
      ),
    },
    {
      value: 'codex' as const,
      label: 'Codex',
      panel: (
        <>
          <p className="small muted">Run this once in a terminal. It adds AnswerOnce to Codex for all your projects.</p>
          <CodeBlock label="Codex command" code={codexCommand(paths)} />
          <p className="small muted">
            Or add this to <code>~/.codex/config.toml</code>.
          </p>
          <CodeBlock label="Codex config" code={codexConfig(paths)} />
        </>
      ),
    },
    {
      value: 'antigravity' as const,
      label: 'Antigravity',
      panel: (
        <>
          <p className="small muted">Run this once in a terminal. It adds AnswerOnce to Antigravity for all your workspaces.</p>
          <CodeBlock label="Antigravity command" code={antigravityCommand(paths)} />
          <p className="small muted">
            Or, in Antigravity, open the agent panel menu → MCP Servers → Manage MCP Servers → View raw config, and add this to{' '}
            <code>~/.gemini/config/mcp_config.json</code> (or <code>.agents/mcp_config.json</code> in a workspace). If the file already has <code>mcpServers</code>,
            add the <code>answeronce</code> entry to it.
          </p>
          <CodeBlock label="Antigravity config" code={antigravityConfig(paths)} />
        </>
      ),
    },
    {
      value: 'opencode' as const,
      label: 'OpenCode',
      panel: (
        <>
          <p className="small muted">
            Add this to <code>~/.config/opencode/opencode.json</code> (or <code>opencode.json</code> in a project). If the file already has <code>mcp</code>, add the{' '}
            <code>answeronce</code> entry to it.
          </p>
          <CodeBlock label="OpenCode config" code={opencodeConfig(paths)} />
        </>
      ),
    },
    {
      value: 'cursor' as const,
      label: 'Cursor',
      panel: (
        <>
          <p className="small muted">
            Add this to <code>~/.cursor/mcp.json</code>. If the file already has <code>mcpServers</code>, add the <code>answeronce</code> entry to it.
          </p>
          <CodeBlock label="Cursor config" code={cursorConfig(paths)} />
        </>
      ),
    },
  ];

  return (
    <details className="card disclosure-card">
      <summary>
        <span className="icon-tile neutral" aria-hidden="true">
          <TerminalSquare />
        </span>
        <span className="titles">
          <strong>Claude Code, Codex, Antigravity, OpenCode or Cursor</strong>
          <span>For developer tools. Takes one copy and paste.</span>
        </span>
        <ChevronRight className="chevron" aria-hidden="true" />
      </summary>
      <div className="disclosure-body">
        <div className="stack-sm">
          <span className="subsection-title">Step 1</span>
          <div className="row">
            <button type="button" className="primary" disabled={adding} onClick={() => void addConnector()}>
              {adding ? <Spinner /> : <FolderPlus aria-hidden="true" />}
              Add the connector to your profile folder
            </button>
          </div>
          {connector === 'added' ? (
            <p className="small ok row-nowrap" role="status">
              <CircleCheck aria-hidden="true" style={{ width: 16, height: 16, flex: 'none' }} />
              Connector added to your profile folder. Click again after you update AnswerOnce.
            </p>
          ) : (
            <p className="small muted">It puts a small program in your profile folder that your agent starts. Your browser may ask for permission.</p>
          )}
        </div>

        <div className="stack-sm">
          <span className="subsection-title">Step 2</span>
          <TextField
            label="Profile folder location"
            value={setup.profileFolder}
            placeholder={paths.profile}
            hint={`In Finder, select the folder named ${folderName ? `“${folderName}”` : 'like your profile folder'}, press Option+Cmd+C to copy its path, then paste it here.`}
            onChange={(v) => set({ profileFolder: v })}
          />
          {otherFolder && (
            <Callout tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
              This path ends in “{baseName(setup.profileFolder)}”, but your profile folder is named “{folderName}”. Check that it is the same folder.
            </Callout>
          )}
        </div>

        <div className="stack-sm">
          <span className="subsection-title">Step 3</span>
          <p className="small" style={{ color: 'var(--text-2)' }}>
            Add AnswerOnce to your agent, then restart it.
          </p>
          <Tabs label="Agent" value={agent} tabs={tabs} onChange={setAgent} />
        </div>

        <details className="disclosure">
          <summary>
            <ChevronRight aria-hidden="true" />
            Troubleshooting
          </summary>
          <div className="disclosure-body">
            <p className="small" style={{ color: 'var(--text-2)' }}>
              Your agent can't start AnswerOnce, or says “node: command not found”? AnswerOnce needs Node.js 22.13 or newer. Desktop apps don't see the PATH of your terminal,
              so if you installed Node with nvm or mise, run <code>which node</code> in a terminal and paste the result here.
            </p>
            <TextField label="Node path" value={setup.nodePath} placeholder={NODE_DEFAULT} onChange={(v) => set({ nodePath: v })} />
            <p className="small" style={{ color: 'var(--text-2)' }}>
              On a Mac, if AnswerOnce says access to the folder was blocked, open System Settings → Privacy &amp; Security → Files and Folders and allow your agent's app
              (or your terminal).
            </p>
          </div>
        </details>
      </div>
    </details>
  );
}
