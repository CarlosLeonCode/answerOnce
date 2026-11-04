import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAgentDirectWrite } from '../../src/application/agent-proposals';
import { markApplied, readApplications, recordFilledPage } from '../../src/application/applications';
import { NodeVaultStorage } from '../../src/infrastructure/vault/node-vault-storage';
import { openProfile } from '../../src/application/vault';
import type { Profile } from '../../src/domain/profile';
import { sampleProfile } from '../helpers/dom';
import { connectInProcess, resultJson, resultText } from '../helpers/mcp';
import { diskFolder, tempDir } from '../helpers/vault';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');

function profileWithSecrets(): Profile {
  const p = sampleProfile();
  p.ai = { provider: 'claude', model: 'claude-x', apiKey: 'sk-ant-SECRET', ollamaBaseUrl: 'http://localhost:11434' };
  return p;
}

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function setup(options: { clientName?: string } = {}) {
  const folder = await diskFolder(profileWithSecrets());
  const settings = fs.readFileSync(path.join(folder.dir, 'settings.json'), 'utf8');
  const conn = await connectInProcess(folder.dir, options.clientName);
  cleanup.push(conn.close);
  /** The profile as the extension reads it (profile.json + settings.json). */
  const reopen = async () => (await openProfile(folder.deps)).profile;
  const settingsUnchanged = () => expect(fs.readFileSync(path.join(folder.dir, 'settings.json'), 'utf8')).toBe(settings);
  return { ...folder, ...conn, reopen, settingsUnchanged };
}

describe('answeronce-mcp tools (in process)', () => {
  it('exposes the documented tools and no way to change direct write', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_application',
      'get_profile',
      'import_cv_file',
      'list_applications',
      'list_documents',
      'list_proposals',
      'list_saved_answers',
      'propose_education',
      'propose_experience',
      'propose_profile_update',
      'propose_remove_answer',
      'save_answer',
      'update_application',
      'vault_status',
      'withdraw_proposal',
    ]);
    const schemas = JSON.stringify(tools.map((t) => t.inputSchema));
    expect(schemas).not.toMatch(/directWrite|"agents"|apiKey|passphrase/i);
    for (const tool of tools) expect(tool.description, tool.name).toBeTruthy();
  });

  it('reports the folder status without personal data', async () => {
    const { client, dir } = await setup();
    const status = resultJson(await client.callTool({ name: 'vault_status', arguments: {} }));
    expect(status).toEqual({ folder: dir, profileFound: true, revision: 2, directWrite: false, pendingProposals: 0 });
  });

  it('refuses with a clear message when the folder has no profile.json', async () => {
    const conn = await connectInProcess(tempDir());
    cleanup.push(conn.close);
    const result = await conn.client.callTool({ name: 'get_profile', arguments: { sections: ['personal'] } });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/No AnswerOnce profile \(profile.json\)/);
    expect(resultJson(await conn.client.callTool({ name: 'vault_status', arguments: {} }))).toMatchObject({ profileFound: false });
  });

  it('never reads settings.json', async () => {
    const { folder } = await setup();
    await expect(folder.storage.readText('settings.json')).rejects.toThrow(/never accesses settings.json/);
    await expect(folder.storage.writeText('settings.json', '{}')).rejects.toThrow(/never accesses settings.json/);
    const { deps } = await folder.open();
    expect((await deps.session.get())!.profile.ai).toMatchObject({ provider: 'none', model: '', apiKey: '' });
  });

  it('get_profile returns only the requested sections and never secrets', async () => {
    const { client } = await setup();
    const data = resultJson(await client.callTool({ name: 'get_profile', arguments: { sections: ['personal', 'experience'] } }));
    expect(Object.keys(data).sort()).toEqual(['experience', 'personal', 'revision']);
    expect(data.personal).toMatchObject({ firstName: 'Ada', email: 'ada@example.com' });
    const everything = resultText(
      await client.callTool({ name: 'get_profile', arguments: { sections: ['personal', 'links', 'about', 'workAuthorization', 'preferences', 'experience', 'education', 'savedAnswers'] } }),
    );
    for (const secret of ['sk-ant-SECRET', 'claude-x', 'documents/cv-12345678.pdf', 'directWrite']) expect(everything).not.toContain(secret);
    const bad = await client.callTool({ name: 'get_profile', arguments: { sections: ['ai'] } });
    expect(bad.isError).toBe(true);
  });

  it('propose_profile_update creates a proposal named after the client; extra keys cannot enable direct write', async () => {
    const { client, reopen, settingsUnchanged } = await setup({ clientName: 'claude-code' });
    const result = resultJson(
      await client.callTool({
        name: 'propose_profile_update',
        arguments: { description: 'New headline', headline: 'Analyst', agents: { directWrite: true }, ai: { apiKey: 'stolen' } },
      }),
    );
    expect(result).toMatchObject({ status: 'proposed', pendingChanges: 1 });
    const profile = await reopen();
    expect(profile.agents.directWrite).toBe(false);
    expect(profile.ai.apiKey).toBe('sk-ant-SECRET');
    expect(profile.headline).toBe('');
    expect(profile.agentProposals).toEqual([expect.objectContaining({ client: 'Claude Code', summary: 'New headline', changes: { headline: 'Analyst' } })]);

    const listed = resultJson<{ proposals: { id: string; changeCount: number }[] }>(await client.callTool({ name: 'list_proposals', arguments: {} }));
    expect(listed.proposals).toEqual([expect.objectContaining({ changeCount: 1 })]);
    const withdrawn = resultJson(await client.callTool({ name: 'withdraw_proposal', arguments: { proposalId: listed.proposals[0]!.id } }));
    expect(withdrawn).toMatchObject({ status: 'withdrawn' });
    expect((await reopen()).agentProposals).toEqual([]);
    settingsUnchanged();
  });

  it('applies directly only when the user enabled it in the extension', async () => {
    const { client, deps, reopen, settingsUnchanged } = await setup();
    await setAgentDirectWrite(deps, true);
    const result = resultJson(await client.callTool({ name: 'save_answer', arguments: { label: 'Notice period?', answer: 'One month.' } }));
    expect(result).toMatchObject({ status: 'applied', appliedChanges: 1 });
    expect(String(result.note)).toMatch(/Direct write is ON/);
    const profile = await reopen();
    expect(profile.savedAnswers).toEqual([expect.objectContaining({ label: 'Notice period?', answer: 'One month.' })]);
    expect(profile.ai.apiKey).toBe('sk-ant-SECRET');
    settingsUnchanged();
  });

  it('import_cv_file extracts the text locally and attaches a copy of the file to a proposal', async () => {
    const { client, dir, reopen } = await setup();
    const result = resultJson<{ status: string; proposalId: string; text: string }>(
      await client.callTool({ name: 'import_cv_file', arguments: { path: path.join(FIXTURES, 'sample-cv.docx') } }),
    );
    expect(result.status).toBe('proposed');
    expect(result.text).toContain('Jordan Rivera');
    const experience = resultJson(
      await client.callTool({
        name: 'propose_experience',
        arguments: { description: 'Roles from CV', proposalId: result.proposalId, add: [{ company: 'Lumen Analytics', title: 'Senior Frontend Engineer', startDate: '2021-03', current: true }] },
      }),
    );
    expect(experience).toMatchObject({ status: 'proposed', proposalId: result.proposalId });
    const [proposal] = (await reopen()).agentProposals;
    expect(proposal).toMatchObject({ source: 'cv-import', pendingDocument: expect.objectContaining({ fileName: 'sample-cv.docx' }) });
    expect(proposal!.pendingDocument!.storedAs).toMatch(/^documents\/sample-cv-[0-9a-f]{8}\.docx$/);
    expect(fs.readFileSync(path.join(dir, proposal!.pendingDocument!.storedAs))).toEqual(fs.readFileSync(path.join(FIXTURES, 'sample-cv.docx')));

    expect((await client.callTool({ name: 'import_cv_file', arguments: { path: 'relative/cv.pdf' } })).isError).toBe(true);
    expect(resultText(await client.callTool({ name: 'import_cv_file', arguments: { path: '/etc/hosts' } }))).toMatch(/Unsupported file type/);
  });

  it('list_documents returns metadata only', async () => {
    const { client } = await setup();
    const { documents } = resultJson<{ documents: Record<string, unknown>[] }>(await client.callTool({ name: 'list_documents', arguments: {} }));
    expect(documents).toEqual([{ id: 'doc-cv', kind: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', size: 10, addedAt: '2026-01-01T00:00:00Z', defaultResume: true }]);
  });

  it('reports unknown ids back to the agent', async () => {
    const { client } = await setup();
    const result = await client.callTool({ name: 'propose_education', arguments: { description: 'x', remove: ['nope'] } });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/Unknown education id "nope"/);
  });

  describe('applications', () => {
    async function withApplications() {
      const ctx = await setup();
      const storage = new NodeVaultStorage(ctx.dir);
      const filled = await recordFilledPage({ storage, now: () => '2026-10-01T09:00:00.000Z' }, { url: 'https://jobs.lever.co/globex/abc', company: 'Globex', role: 'Staff Frontend Engineer', ats: 'lever' }, [
        { label: 'Full name', value: 'Ada Lovelace' },
      ]);
      const applied = await markApplied(
        { storage, now: () => '2026-10-03T10:00:00.000Z' },
        { url: 'https://boards.greenhouse.io/acme/jobs/123', company: 'Acme', role: 'Senior Backend Engineer', ats: 'greenhouse' },
        [{ label: 'Why do you want to work at Acme?', value: 'Logistics at scale.' }],
      );
      return { ...ctx, storage, filled: filled.application, applied: applied.application };
    }

    it('list_applications returns summaries newest first, with filters', async () => {
      const { client, filled, applied } = await withApplications();
      const all = resultJson<{ count: number; applications: Record<string, unknown>[] }>(await client.callTool({ name: 'list_applications', arguments: {} }));
      expect(all.count).toBe(2);
      expect(all.applications.map((a) => a.id)).toEqual([applied.id, filled.id]);
      expect(all.applications[0]).toEqual({
        id: applied.id,
        company: 'Acme',
        role: 'Senior Backend Engineer',
        status: 'applied',
        url: 'https://boards.greenhouse.io/acme/jobs/123',
        ats: 'greenhouse',
        createdAt: '2026-10-03T10:00:00.000Z',
        appliedAt: '2026-10-03T10:00:00.000Z',
        answerCount: 1,
        hasNotes: false,
      });
      // Listings never carry the answers themselves.
      expect(resultText(await client.callTool({ name: 'list_applications', arguments: {} }))).not.toContain('Logistics at scale');

      const byStatus = resultJson<{ applications: { id: string }[] }>(await client.callTool({ name: 'list_applications', arguments: { status: 'filled' } }));
      expect(byStatus.applications.map((a) => a.id)).toEqual([filled.id]);
      const since = resultJson<{ applications: { id: string }[] }>(await client.callTool({ name: 'list_applications', arguments: { since: '2026-10-02' } }));
      expect(since.applications.map((a) => a.id)).toEqual([applied.id]);
      const query = resultJson<{ applications: { id: string }[] }>(await client.callTool({ name: 'list_applications', arguments: { query: 'globex' } }));
      expect(query.applications.map((a) => a.id)).toEqual([filled.id]);
      expect((await client.callTool({ name: 'list_applications', arguments: { status: 'hired' } })).isError).toBe(true);
      expect((await client.callTool({ name: 'list_applications', arguments: { since: 'last week' } })).isError).toBe(true);
    });

    it('get_application returns the full record; unknown ids are reported', async () => {
      const { client, applied } = await withApplications();
      const app = resultJson(await client.callTool({ name: 'get_application', arguments: { id: applied.id } }));
      expect(app).toMatchObject({ id: applied.id, status: 'applied', answers: [{ label: 'Why do you want to work at Acme?', value: 'Logistics at scale.' }], notes: '' });
      const missing = await client.callTool({ name: 'get_application', arguments: { id: 'nope' } });
      expect(missing.isError).toBe(true);
      expect(resultText(missing)).toMatch(/No application with id "nope"/);
    });

    it('update_application writes status and notes directly, and nothing else', async () => {
      const { client, storage, dir, applied, reopen, settingsUnchanged } = await withApplications();
      const profileBefore = fs.readFileSync(path.join(dir, 'profile.json'), 'utf8');
      const result = resultJson<{ status: string; statusHistory: { status: string }[]; notes: string }>(
        await client.callTool({ name: 'update_application', arguments: { id: applied.id, status: 'interview', notes: 'Recruiter call on Oct 12.' } }),
      );
      expect(result.status).toBe('updated');
      expect(result.notes).toBe('Recruiter call on Oct 12.');
      expect(result.statusHistory.map((h) => h.status)).toEqual(['applied', 'interview']);

      // Only status and notes: company, answers or unknown keys cannot be changed.
      const sneaky = await client.callTool({ name: 'update_application', arguments: { id: applied.id, company: 'Evil Corp', answers: [] } });
      expect(sneaky.isError).toBe(true);
      expect((await client.callTool({ name: 'update_application', arguments: { id: applied.id } })).isError).toBe(true);
      expect((await client.callTool({ name: 'update_application', arguments: { id: applied.id, status: 'hired' } })).isError).toBe(true);

      const { applications, revision } = await readApplications(storage);
      expect(applications.find((a) => a.id === applied.id)).toMatchObject({ company: 'Acme', status: 'interview', notes: 'Recruiter call on Oct 12.', answers: [expect.anything()] });
      expect(revision).toBe(3);
      expect(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8')).toBe(profileBefore);
      expect((await reopen()).agentProposals).toEqual([]);
      settingsUnchanged();
    });

    it('application tools never expose settings.json', async () => {
      const { client, applied } = await withApplications();
      const { tools } = await client.listTools();
      const appTools = tools.filter((t) => /application/.test(t.name));
      expect(JSON.stringify(appTools)).not.toMatch(/apiKey|settings\.json"|"ai"/);
      const texts = [
        resultText(await client.callTool({ name: 'list_applications', arguments: {} })),
        resultText(await client.callTool({ name: 'get_application', arguments: { id: applied.id } })),
        resultText(await client.callTool({ name: 'update_application', arguments: { id: applied.id, notes: 'x' } })),
      ].join('\n');
      for (const secret of ['sk-ant-SECRET', 'claude-x', 'apiKey']) expect(texts).not.toContain(secret);
    });

    it('reports a missing profile folder like the other tools', async () => {
      const conn = await connectInProcess(tempDir());
      cleanup.push(conn.close);
      const result = await conn.client.callTool({ name: 'list_applications', arguments: {} });
      expect(result.isError).toBe(true);
      expect(resultText(result)).toMatch(/No AnswerOnce profile \(profile.json\)/);
    });
  });
});
