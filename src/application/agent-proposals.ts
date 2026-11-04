import { countChanges, mergeChanges, normalizeChanges, unknownReferences } from '../domain/agent-proposals';
import { applyMerge, buildChangePlan, countAccepted, defaultDecisions, type MergeDecisions, type MergePlan } from '../domain/cv-merge';
import { newId, type AgentProposal, type Profile, type ProfileChanges, type ProposalSource } from '../domain/profile';
import type { DocumentFile } from '../ports/document-text-extractor';
import type { ProfileSession } from '../ports/session-store';
import { saveCvImport } from './cv-import';
import { requireSession, saveProfile, storeDocument, VaultConflictError, VaultError, type VaultDeps } from './vault';

/**
 * Use cases for changes suggested by AI agents. By default an agent only adds
 * a proposal to profile.json; the user reviews and accepts it in the
 * extension. If the user turned on direct write (extension UI only), changes
 * are applied immediately instead.
 */

export class AgentInputError extends VaultError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentInputError';
  }
}

/** Re-reads profile.json into the session (used to retry after a conflict). */
export type Reload = () => Promise<unknown>;

export type SubmitOutcome =
  | { status: 'proposed'; proposal: AgentProposal; warnings: string[] }
  | { status: 'applied'; applied: number; warnings: string[] };

export interface SubmitInput {
  /** MCP client name, e.g. "claude-code". */
  client: string;
  /** Short description for the user. */
  summary: string;
  changes: ProfileChanges;
  /** Adds the changes to this pending proposal instead of creating a new one. */
  proposalId?: string;
  source?: ProposalSource;
}

const MAX_SUMMARY = 300;
const clip = (s: string) => s.trim().slice(0, MAX_SUMMARY);

/**
 * Runs `attempt` and, after a VaultConflictError, reloads and runs it once more.
 * Used for proposal bookkeeping, which is safe to recompute on fresh data.
 */
async function retryOnce<T>(reload: Reload | undefined, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof VaultConflictError) || !reload) throw error;
    await reload();
    return attempt();
  }
}

/** Applies changes as if every one of them was accepted in overwrite mode. */
export function applyChangesDirectly(profile: Profile, changes: ProfileChanges): { profile: Profile; applied: number } {
  const plan = buildChangePlan(profile, changes);
  const decisions = defaultDecisions(plan, 'overwrite');
  return { profile: applyMerge(profile, plan, decisions), applied: countAccepted(plan, decisions) };
}

/** Proposes (or, with direct write on, applies) profile changes from an agent. */
export async function submitChanges(deps: VaultDeps, input: SubmitInput, reload?: Reload): Promise<SubmitOutcome> {
  const { changes, warnings } = normalizeChanges(input.changes);
  if (countChanges(changes) === 0) throw new AgentInputError(['No changes to propose.', ...warnings].join(' '));

  const initial = await requireSession(deps.session);
  if (initial.profile.agents.directWrite) {
    const problems = unknownReferences(initial.profile, changes);
    if (problems.length) throw new AgentInputError(problems.join(' '));
    // No automatic retry: the user may have edited the same values meanwhile.
    const { profile, applied } = applyChangesDirectly(initial.profile, changes);
    await saveProfile(deps, profile);
    return { status: 'applied', applied, warnings };
  }

  return retryOnce(reload, async () => {
    const { profile } = await requireSession(deps.session);
    const problems = unknownReferences(profile, changes);
    if (problems.length) throw new AgentInputError(problems.join(' '));
    let proposal: AgentProposal;
    let proposals: AgentProposal[];
    if (input.proposalId) {
      const existing = profile.agentProposals.find((p) => p.id === input.proposalId);
      if (!existing) throw new AgentInputError(`Proposal "${input.proposalId}" is not pending (the user may have accepted or rejected it). Create a new proposal instead.`);
      const summary = input.summary.trim() && !existing.summary.includes(input.summary.trim()) ? clip(`${existing.summary}; ${input.summary}`) : existing.summary;
      proposal = { ...existing, summary, changes: mergeChanges(existing.changes, changes) };
      proposals = profile.agentProposals.map((p) => (p.id === existing.id ? proposal : p));
    } else {
      proposal = {
        id: newId(),
        createdAt: new Date().toISOString(),
        client: input.client,
        summary: clip(input.summary),
        source: input.source ?? 'update',
        changes,
        pendingDocument: null,
      };
      proposals = [...profile.agentProposals, proposal];
    }
    await saveProfile(deps, { ...profile, agentProposals: proposals });
    return { status: 'proposed', proposal, warnings };
  });
}

export type ImportOutcome = { status: 'proposed'; proposal: AgentProposal } | { status: 'applied'; documentId: string };

/**
 * Copies a CV picked by an agent into documents/, like any other document.
 * With review (default) it is attached to a new proposal and becomes the
 * default resume only when the user accepts it.
 */
export async function importCvDocument(deps: VaultDeps, input: { client: string; file: DocumentFile }, reload?: Reload): Promise<ImportOutcome> {
  const session = await requireSession(deps.session);
  if (session.profile.agents.directWrite) {
    const saved = await saveCvImport(deps, { profile: session.profile, cv: input.file });
    return { status: 'applied', documentId: saved.profile.defaultResumeId };
  }
  const ref = await storeDocument(deps, { kind: 'cv', ...input.file });
  try {
    return await retryOnce(reload, async () => {
      const { profile } = await requireSession(deps.session);
      const proposal: AgentProposal = {
        id: newId(),
        createdAt: new Date().toISOString(),
        client: input.client,
        summary: clip(`Import CV ${input.file.fileName}`),
        source: 'cv-import',
        changes: {},
        pendingDocument: ref,
      };
      await saveProfile(deps, { ...profile, agentProposals: [...profile.agentProposals, proposal] });
      return { status: 'proposed' as const, proposal };
    });
  } catch (error) {
    await deps.storage.remove(ref.storedAs).catch(() => undefined);
    throw error;
  }
}

/** Removes a pending proposal (rejected by the user or withdrawn by the agent) and its pending file. */
export async function discardProposal(deps: VaultDeps, proposalId: string, reload?: Reload): Promise<ProfileSession> {
  let pendingFile: string | null = null;
  const saved = await retryOnce(reload, async () => {
    const { profile } = await requireSession(deps.session);
    const proposal = profile.agentProposals.find((p) => p.id === proposalId);
    if (!proposal) throw new AgentInputError(`Proposal "${proposalId}" is not pending.`);
    pendingFile = proposal.pendingDocument?.storedAs ?? null;
    return saveProfile(deps, { ...profile, agentProposals: profile.agentProposals.filter((p) => p.id !== proposalId) });
  });
  if (pendingFile) await deps.storage.remove(pendingFile).catch(() => undefined);
  return saved;
}

/**
 * Applies the reviewed decisions of a proposal and removes it. The proposal's
 * CV (if any) becomes the default resume when `attachDocument` is true.
 */
export async function acceptProposal(
  deps: VaultDeps,
  input: { proposalId: string; plan: MergePlan; decisions: MergeDecisions; attachDocument: boolean },
): Promise<ProfileSession> {
  const { profile } = await requireSession(deps.session);
  const proposal = profile.agentProposals.find((p) => p.id === input.proposalId);
  if (!proposal) throw new VaultError('This proposal is no longer pending.');
  let next: Profile = { ...applyMerge(profile, input.plan, input.decisions), agentProposals: profile.agentProposals.filter((p) => p.id !== proposal.id) };
  let unusedFile: string | null = null;
  const doc = proposal.pendingDocument;
  if (doc && input.attachDocument) {
    const existing = next.documents.find((d) => d.kind === 'cv' && d.fileName === doc.fileName && d.size === doc.size);
    if (existing) unusedFile = doc.storedAs;
    next = { ...next, documents: existing ? next.documents : [...next.documents, doc], defaultResumeId: (existing ?? doc).id };
  } else if (doc) unusedFile = doc.storedAs;
  const saved = await saveProfile(deps, next);
  if (unusedFile) await deps.storage.remove(unusedFile).catch(() => undefined);
  return saved;
}

/** Turns direct write on or off. Called from the extension UI only; agents have no way to change it. */
export async function setAgentDirectWrite(deps: VaultDeps, enabled: boolean): Promise<ProfileSession> {
  const { profile } = await requireSession(deps.session);
  return saveProfile(deps, { ...profile, agents: { ...profile.agents, directWrite: enabled } });
}
