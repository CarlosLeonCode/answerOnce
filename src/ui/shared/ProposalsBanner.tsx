import { Inbox } from 'lucide-react';
import { proposalsHeadline } from '../../domain/agent-proposals';
import type { AgentProposal } from '../../domain/profile';
import { Callout } from './components';

/** "3 changes proposed by Claude Code" + Review. Renders nothing without pending proposals. */
export function ProposalsBanner({ proposals, onReview, compact }: { proposals: readonly AgentProposal[]; onReview: () => void; compact?: boolean }) {
  if (proposals.length === 0) return null;
  return (
    <div role="region" aria-label="Agent proposals">
      <Callout tone="info" icon={<Inbox aria-hidden="true" />} role="status">
        <strong>{proposalsHeadline(proposals)}</strong>
        <span>{compact ? 'Nothing changes until you accept.' : 'An AI agent suggested changes to your profile. Nothing is applied until you review and accept them.'}</span>
        <button type="button" className="primary sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={onReview}>
          Review changes
        </button>
      </Callout>
    </div>
  );
}
