import { describe, expect, it } from 'vitest';
import {
  acceptProposal,
  AgentInputError,
  discardProposal,
  importCvDocument,
  setAgentDirectWrite,
  submitChanges,
} from '../../src/application/agent-proposals';
import { openProfile, readDocument, saveProfile, VaultConflictError } from '../../src/application/vault';
import { countChanges, mergeChanges, normalizeChanges, PROFILE_SECTIONS, profileView, proposalMergeMode, proposalsHeadline } from '../../src/domain/agent-proposals';
import { applyMerge, buildChangePlan, countAccepted, defaultDecisions } from '../../src/domain/cv-merge';
import { ProfileChangesSchema, type Profile } from '../../src/domain/profile';
import { PROFILE_FILE } from '../../src/ports/vault-storage';
import { utf8 } from '../../src/shared/encoding';
import { sampleProfile } from '../helpers/dom';
import { memoryFolder, otherWriter, type MemoryDeps } from '../helpers/vault';

let seq = 0;
const ids = () => `id-${++seq}`;

function secretProfile(): Profile {
  const p = sampleProfile();
  p.ai = { provider: 'openai', model: 'gpt-x', apiKey: 'sk-SECRET-API-KEY', ollamaBaseUrl: 'http://localhost:11434' };
  p.savedAnswers = [{ id: 'a1', label: 'Why us?', answer: 'Because.', updatedAt: '2026-01-01T00:00:00Z' }];
  return p;
}

const profileOf = async (deps: MemoryDeps) => (await deps.session.get())!.profile;

describe('scoped profile view', () => {
  it('returns only the requested sections', () => {
    const view = profileView(secretProfile(), ['personal', 'about']);
    expect(Object.keys(view)).toEqual(['personal', 'about']);
    expect(view.about).toEqual({ headline: '', summary: '', skills: [] });
  });

  it('never contains AI settings, keys, documents, proposals or agent settings', () => {
    const profile = secretProfile();
    profile.agentProposals = [{ id: 'p', createdAt: '', client: 'x', summary: 'PROPOSAL-SUMMARY', source: 'update', changes: {}, pendingDocument: null }];
    const json = JSON.stringify(profileView(profile, PROFILE_SECTIONS));
    for (const secret of ['sk-SECRET-API-KEY', 'gpt-x', 'documents/cv-12345678.pdf', 'doc-cv', 'PROPOSAL-SUMMARY', 'directWrite', 'ollamaBaseUrl']) expect(json).not.toContain(secret);
  });
});

describe('proposal changes (domain)', () => {
  it('rejects changes outside the allowed sections', () => {
    expect(ProfileChangesSchema.safeParse({ agents: { directWrite: true } }).success).toBe(false);
    expect(ProfileChangesSchema.safeParse({ ai: { apiKey: 'x' } }).success).toBe(false);
    expect(ProfileChangesSchema.safeParse({ documents: [] }).success).toBe(false);
    expect(ProfileChangesSchema.safeParse({ personal: { firstName: 'Ada', password: 'x' } }).success).toBe(false);
  });

  it('normalizes untrusted values and reports dropped ones', () => {
    const { changes, warnings } = normalizeChanges({
      personal: { email: 'not-an-email', phone: '  +34   600 111 222 ' },
      links: { github: 'github.com/ada', portfolio: 'javascript:alert(1)' },
      skills: { add: ['TypeScript', 'typescript', ' '] },
      experience: { add: [{ company: 'Acme', title: 'Engineer', location: '', startDate: 'March 2021', endDate: 'present', current: false, description: '' }] },
    });
    expect(changes.personal).toEqual({ phone: '+34 600 111 222' });
    expect(changes.links).toEqual({ github: 'https://github.com/ada' });
    expect(changes.skills).toEqual({ add: ['TypeScript'] });
    expect(changes.experience?.add?.[0]).toMatchObject({ startDate: '2021-03', endDate: '', current: true });
    expect(warnings).toHaveLength(2);
  });

  it('merges into a pending proposal and counts changes', () => {
    const merged = mergeChanges({ headline: 'A', skills: { add: ['Go'] } }, { headline: 'B', skills: { add: ['Rust'] }, education: { remove: ['ed1'] } });
    expect(merged).toEqual({ headline: 'B', skills: { add: ['Go', 'Rust'] }, education: { remove: ['ed1'] } });
    expect(countChanges(merged)).toBe(4);
  });

  it('plans and applies updates, removals and saved answers', () => {
    const profile = secretProfile();
    profile.skills = ['Mathematics', 'Poetry'];
    const plan = buildChangePlan(
      profile,
      {
        experience: { update: [{ id: 'e1', title: 'Principal Engineer' }], remove: [] },
        education: { remove: ['ed1'] },
        skills: { remove: ['poetry'] },
        savedAnswers: { upsert: [{ label: 'why us?', answer: 'Because I love engines.' }, { label: 'Salary?', answer: '90k' }], remove: [] },
        preferences: { workModes: ['remote'], willingToRelocate: false },
      },
      ids,
    );
    expect(plan.experience).toEqual([expect.objectContaining({ id: 'e1', duplicateOf: 'e1', patch: { title: 'Principal Engineer' } })]);
    expect(plan.removals.map((r) => r.key)).toEqual(['education:ed1', 'skill:Poetry']);
    expect(plan.answers.map((a) => [a.id, a.current])).toEqual([
      ['a1', 'Because.'],
      [expect.stringMatching(/^id-/), ''],
    ]);
    const decisions = defaultDecisions(plan, 'fill-empty');
    expect(countAccepted(plan, decisions)).toBe(plan.fields.filter((f) => !f.current).length + 5);
    const merged = applyMerge(profile, plan, defaultDecisions(plan, 'overwrite'), '2026-11-02T00:00:00Z');
    expect(merged.experience[0]).toMatchObject({ id: 'e1', title: 'Principal Engineer', company: 'Analytical Engines Ltd', current: true });
    expect(merged.education).toEqual([]);
    expect(merged.skills).toEqual(['Mathematics']);
    expect(merged.savedAnswers.map((a) => [a.label, a.answer])).toEqual([
      ['why us?', 'Because I love engines.'],
      ['Salary?', '90k'],
    ]);
    expect(merged.preferences).toMatchObject({ workModes: ['remote'], willingToRelocate: false });
    expect(merged.ai.apiKey).toBe('sk-SECRET-API-KEY');
  });

  it('describes pending proposals for the banner', () => {
    const p = (client: string, changes = {}) => ({ id: client, createdAt: '', client, summary: '', source: 'update' as const, changes, pendingDocument: null });
    expect(proposalsHeadline([p('Claude Code', { headline: 'x', summary: 'y', skills: { add: ['Go'] } })])).toBe('3 changes proposed by Claude Code');
    expect(proposalsHeadline([p('Claude Code', { headline: 'x' }), p('Cursor')])).toBe('2 changes proposed by Claude Code and Cursor');
    expect(proposalMergeMode({ ...p('x'), source: 'cv-import' })).toBe('fill-empty');
  });
});

describe('agent proposal use cases', () => {
  it('stores a proposal in profile.json without changing the profile', async () => {
    const deps = await memoryFolder(secretProfile());
    const result = await submitChanges(deps, { client: 'Claude Code', summary: 'New headline', changes: { headline: 'Analyst of Engines' } });
    expect(result.status).toBe('proposed');
    const profile = await profileOf(deps);
    expect(profile.headline).toBe('');
    expect(profile.agentProposals).toEqual([
      expect.objectContaining({ client: 'Claude Code', summary: 'New headline', source: 'update', changes: { headline: 'Analyst of Engines' }, pendingDocument: null }),
    ]);
    const onDisk = deps.storage.text(PROFILE_FILE)!;
    expect(onDisk).toContain('"client": "Claude Code"');
    expect(onDisk).toContain('"headline": "Analyst of Engines"');
    expect(onDisk).not.toContain('sk-SECRET-API-KEY');
  });

  it('appends to an existing proposal and validates ids', async () => {
    const deps = await memoryFolder(secretProfile());
    const first = await submitChanges(deps, { client: 'Codex', summary: 'CV import', changes: { headline: 'A' } });
    if (first.status !== 'proposed') throw new Error('expected a proposal');
    await submitChanges(deps, { client: 'Codex', summary: 'Roles', changes: { experience: { remove: ['e1'] } }, proposalId: first.proposal.id });
    const [proposal] = (await profileOf(deps)).agentProposals;
    expect(proposal).toMatchObject({ summary: 'CV import; Roles', changes: { headline: 'A', experience: { remove: ['e1'] } } });

    await expect(submitChanges(deps, { client: 'Codex', summary: 'x', changes: { experience: { remove: ['nope'] } } })).rejects.toThrow(/Unknown experience id "nope"/);
    await expect(submitChanges(deps, { client: 'Codex', summary: 'x', changes: { headline: 'B' }, proposalId: 'missing' })).rejects.toBeInstanceOf(AgentInputError);
    await expect(submitChanges(deps, { client: 'Codex', summary: 'x', changes: { headline: '   ' } })).rejects.toThrow(/No changes/);
  });

  it('re-reads and retries once when the extension saved in between', async () => {
    const agent = await memoryFolder(secretProfile());
    const extension = otherWriter(agent);
    await openProfile(extension);
    await saveProfile(extension, { ...(await profileOf(extension)), headline: 'Edited in the extension' });

    let reloads = 0;
    const reload = async () => {
      reloads++;
      await openProfile(agent);
    };
    const result = await submitChanges(agent, { client: 'Cursor', summary: 's', changes: { summary: 'Hello' } }, reload);
    expect(result.status).toBe('proposed');
    expect(reloads).toBe(1);
    const profile = await profileOf(agent);
    expect(profile.headline).toBe('Edited in the extension'); // nothing lost
    expect(profile.agentProposals).toHaveLength(1);
  });

  it('direct write: applies immediately, but never retries over a conflict', async () => {
    const deps = await memoryFolder(secretProfile());
    await setAgentDirectWrite(deps, true);
    const result = await submitChanges(deps, { client: 'Claude Desktop', summary: 's', changes: { personal: { phone: '+1 555 0100' }, skills: { add: ['Rust'] } } });
    expect(result).toMatchObject({ status: 'applied', applied: 2 });
    expect(await profileOf(deps)).toMatchObject({ personal: { phone: '+1 555 0100' }, skills: ['Rust'], agentProposals: [] });

    const extension = otherWriter(deps);
    await openProfile(extension);
    await saveProfile(extension, await profileOf(extension));
    await expect(submitChanges(deps, { client: 'x', summary: 's', changes: { headline: 'H' } }, async () => undefined)).rejects.toBeInstanceOf(VaultConflictError);
  });

  it('accept applies the reviewed decisions, removes the proposal and attaches the CV', async () => {
    const deps = await memoryFolder(secretProfile());
    const cv = { fileName: 'jordan.pdf', mimeType: 'application/pdf', bytes: utf8.encode('%PDF-1.7 Jordan Rivera') };
    const imported = await importCvDocument(deps, { client: 'Claude Code', file: cv });
    if (imported.status !== 'proposed') throw new Error('expected a proposal');
    const pending = imported.proposal.pendingDocument!;
    expect(pending.storedAs).toMatch(/^documents\/jordan-[0-9a-f]{8}\.pdf$/);
    expect(deps.storage.text(pending.storedAs)).toBe('%PDF-1.7 Jordan Rivera');
    await submitChanges(deps, { client: 'Claude Code', summary: 'Structured CV', changes: { headline: 'Frontend Engineer', personal: { email: 'jordan@example.com' } }, proposalId: imported.proposal.id });

    const profile = await profileOf(deps);
    const proposal = profile.agentProposals[0]!;
    const plan = buildChangePlan(profile, proposal.changes);
    const decisions = defaultDecisions(plan, proposalMergeMode(proposal)); // fill-empty: email is not replaced
    const saved = await acceptProposal(deps, { proposalId: proposal.id, plan, decisions, attachDocument: true });

    expect(saved.profile).toMatchObject({ headline: 'Frontend Engineer', personal: { email: 'ada@example.com' }, agentProposals: [], defaultResumeId: pending.id });
    expect(saved.profile.documents.map((d) => d.id)).toContain(pending.id);
    expect(utf8.decode((await readDocument(deps, pending.id)).bytes)).toBe('%PDF-1.7 Jordan Rivera');
    await expect(acceptProposal(deps, { proposalId: proposal.id, plan, decisions, attachDocument: true })).rejects.toThrow(/no longer pending/);
  });

  it('reject (or withdraw) removes the proposal and deletes its pending file', async () => {
    const deps = await memoryFolder(secretProfile());
    const imported = await importCvDocument(deps, { client: 'Codex', file: { fileName: 'cv.txt', mimeType: 'text/plain', bytes: utf8.encode('cv') } });
    if (imported.status !== 'proposed') throw new Error('expected a proposal');
    const file = imported.proposal.pendingDocument!.storedAs;
    expect(deps.storage.files.has(file)).toBe(true);
    await discardProposal(deps, imported.proposal.id);
    expect(deps.storage.files.has(file)).toBe(false);
    expect((await profileOf(deps)).agentProposals).toEqual([]);
    await expect(discardProposal(deps, imported.proposal.id)).rejects.toThrow(/not pending/);
  });

  it('direct write: an imported CV becomes the default resume at once', async () => {
    const deps = await memoryFolder(secretProfile());
    await setAgentDirectWrite(deps, true);
    const result = await importCvDocument(deps, { client: 'Codex', file: { fileName: 'cv.txt', mimeType: 'text/plain', bytes: utf8.encode('cv') } });
    expect(result.status).toBe('applied');
    const profile = await profileOf(deps);
    expect(profile.defaultResumeId).toBe(result.status === 'applied' ? result.documentId : '');
    expect(profile.agentProposals).toEqual([]);
  });
});
