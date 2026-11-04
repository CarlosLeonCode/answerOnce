import { useState } from 'react';
import { Bot, Check, FileText, Inbox, Plug, X } from 'lucide-react';
import { acceptProposal, discardProposal } from '../../application/agent-proposals';
import { countChanges, proposalMergeMode } from '../../domain/agent-proposals';
import { buildChangePlan, countAccepted, defaultDecisions, type MergeDecisions, type MergePlan } from '../../domain/cv-merge';
import type { AgentProposal } from '../../domain/profile';
import { EmptyState, SectionCard } from '../shared/components';
import { useToast } from '../shared/toast';
import { errorMessage, type VaultApi } from '../shared/use-vault';
import { ReviewMerge } from './import/ReviewMerge';

interface Review {
  proposal: AgentProposal;
  plan: MergePlan;
  decisions: MergeDecisions;
  attachDocument: boolean;
}

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** Changes proposed by AI agents (answeronce-mcp): review with the CV merge screen, accept or reject. */
export function ProposalsPage({ vault, onConnect }: { vault: VaultApi; onConnect: () => void }) {
  const notify = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = vault.session!.profile;
  const proposals = profile.agentProposals;

  const open = (proposal: AgentProposal) => {
    const plan = buildChangePlan(profile, proposal.changes);
    setReview({ proposal, plan, decisions: defaultDecisions(plan, proposalMergeMode(proposal)), attachDocument: proposal.pendingDocument !== null });
  };

  const reject = async (proposal: AgentProposal) => {
    setBusy(true);
    try {
      await discardProposal(await vault.withDeps(), proposal.id);
      setReview(null);
      notify('info', 'Proposal rejected', `Nothing from ${proposal.client} was applied.`);
    } catch (e) {
      notify('error', 'Could not reject the proposal', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (r: Review) => {
    setBusy(true);
    try {
      await acceptProposal(await vault.withDeps(), { proposalId: r.proposal.id, plan: r.plan, decisions: r.decisions, attachDocument: r.attachDocument });
      const n = countAccepted(r.plan, r.decisions);
      setReview(null);
      notify('success', 'Proposal accepted', `${n} ${n === 1 ? 'change' : 'changes'} saved to your profile${r.attachDocument ? ' · CV stored as default resume' : ''}.`);
    } catch (e) {
      notify('error', 'Could not apply the proposal', errorMessage(e));
      if (!vault.session?.profile.agentProposals.some((p) => p.id === r.proposal.id)) setReview(null);
    } finally {
      setBusy(false);
    }
  };

  if (review) {
    const { proposal } = review;
    return (
      <div className="stack-lg">
        <ReviewMerge
          plan={review.plan}
          decisions={review.decisions}
          onDecisions={(decisions) => setReview({ ...review, decisions })}
          introIcon={<Bot aria-hidden="true" />}
          intro={`Proposed by ${proposal.client} on ${when(proposal.createdAt)}: “${proposal.summary || 'No description'}”. Agents can make mistakes: check each value.`}
          incomingLabel="Proposed"
          inputSuffix="proposed"
          emptyText={
            proposal.pendingDocument
              ? 'No profile changes in this proposal. You can still store the attached CV as your resume.'
              : 'Nothing in this proposal would change your profile (it is already up to date).'
          }
          file={proposal.pendingDocument ? { name: proposal.pendingDocument.fileName, store: review.attachDocument, onStore: (attachDocument) => setReview({ ...review, attachDocument }) } : undefined}
          saving={busy}
          saveLabel={(n) => `Accept ${n} ${n === 1 ? 'change' : 'changes'}`}
          onBack={() => setReview(null)}
          actions={
            <button type="button" className="danger" disabled={busy} onClick={() => void reject(proposal)}>
              <X aria-hidden="true" />
              Reject proposal
            </button>
          }
          onSave={() => void accept(review)}
        />
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <SectionCard title="No pending proposals" icon={<Inbox />}>
        <EmptyState
          icon={<Bot />}
          title="Nothing to review"
          description="AI agents like Claude Desktop, Claude Code, Codex, Antigravity, OpenCode or Cursor can propose profile changes. They appear here for your review before anything is saved."
        >
          <button type="button" onClick={onConnect}>
            <Plug aria-hidden="true" />
            Connect an agent
          </button>
        </EmptyState>
      </SectionCard>
    );
  }

  return (
    <div className="stack">
      {proposals.map((p) => {
        const n = countChanges(p.changes);
        return (
          <section key={p.id} className="card section-card" aria-label={`Proposal from ${p.client}`}>
            <header className="section-head">
              <span className="icon-tile neutral" aria-hidden="true">
                <Bot />
              </span>
              <div className="titles">
                <h2>{p.summary || 'Profile changes'}</h2>
                <p>
                  {p.client} · {when(p.createdAt)} · {n} {n === 1 ? 'change' : 'changes'}
                  {p.pendingDocument && (
                    <>
                      {' · '}
                      <FileText aria-hidden="true" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> {p.pendingDocument.fileName}
                    </>
                  )}
                </p>
              </div>
              <div className="row">
                <button type="button" className="ghost sm" disabled={busy} onClick={() => void reject(p)}>
                  Reject
                </button>
                <button type="button" className="primary sm" disabled={busy} onClick={() => open(p)}>
                  <Check aria-hidden="true" />
                  Review
                </button>
              </div>
            </header>
          </section>
        );
      })}
    </div>
  );
}
