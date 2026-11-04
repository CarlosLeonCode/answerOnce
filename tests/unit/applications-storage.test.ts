import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  ApplicationNotFoundError,
  ApplicationsConflictError,
  deleteApplication,
  describeJob,
  getApplication,
  listApplications,
  markApplied,
  mutateApplications,
  parseApplicationsFile,
  readApplications,
  recordAnswer,
  recordFilledPage,
  saveApplications,
  snapshotPage,
  updateApplication,
  type ApplicationsDeps,
} from '../../src/application/applications';
import { VaultError } from '../../src/application/vault';
import type { FrameScan } from '../../src/domain/field';
import { ATS_ADAPTERS } from '../../src/infrastructure/ats';
import { MemoryVaultStorage } from '../../src/infrastructure/vault/memory-vault-storage';
import { NodeVaultStorage } from '../../src/infrastructure/vault/node-vault-storage';
import { scanDocument } from '../../src/page-agent/detector';
import type { PageGateway } from '../../src/ports/page-gateway';
import { APPLICATIONS_FILE, PROFILE_FILE } from '../../src/ports/vault-storage';
import { loadFixture } from '../helpers/dom';
import { diskFolder, memoryFolder } from '../helpers/vault';

let seq = 0;
function deps(storage = new MemoryVaultStorage()): ApplicationsDeps & { storage: MemoryVaultStorage } {
  let tick = 0;
  return { storage, now: () => new Date(Date.UTC(2026, 9, 3, 10, tick++)).toISOString(), newId: () => `app-${++seq}` };
}
const JOB = { url: 'https://boards.greenhouse.io/acme/jobs/123', company: 'Acme', role: 'Senior Backend Engineer', ats: 'greenhouse' };

describe('applications.json storage', () => {
  it('a missing file is an empty list at revision 0', async () => {
    expect(await readApplications(new MemoryVaultStorage())).toEqual({ applications: [], revision: 0 });
  });

  it('is pretty-printed JSON with its own revision first, validated on read', async () => {
    const d = deps();
    await recordFilledPage(d, JOB, [{ label: 'First Name', value: 'Ada' }]);
    const text = d.storage.text(APPLICATIONS_FILE)!;
    expect(text).toMatch(/^\{\n {2}"rev": 1,\n {2}"schemaVersion": 1,\n {2}"applications": \[\n/);
    expect(JSON.parse(text)).toMatchObject({ rev: 1, applications: [{ company: 'Acme', status: 'filled', answers: [{ label: 'First Name', value: 'Ada' }] }] });

    expect(() => parseApplicationsFile('{oops')).toThrow(/not valid JSON/);
    expect(() => parseApplicationsFile('[]')).toThrow(/must contain a JSON object/);
    expect(() => parseApplicationsFile('{"rev": -1}')).toThrow(/invalid "rev"/);
    expect(() => parseApplicationsFile('{"applications": [{"id": "x"}]}')).toThrow(VaultError);
    // Hand-written file without rev: revision 0, defaults applied.
    expect(parseApplicationsFile('{"applications": [{"id": "x", "url": "u", "normalizedUrl": "u", "createdAt": "2026-01-01"}]}')).toMatchObject({
      revision: 0,
      applications: [{ id: 'x', status: 'filled', answers: [], notes: '' }],
    });
  });

  it('refuses a write based on an outdated revision', async () => {
    const d = deps();
    await recordFilledPage(d, JOB, []);
    const { applications, revision } = await readApplications(d.storage);
    // Someone else (another window, an agent) writes in between.
    await updateApplication(d, applications[0]!.id, { notes: 'theirs' });
    const error = await saveApplications(d.storage, applications, revision).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationsConflictError);
    expect((error as ApplicationsConflictError).currentRevision).toBe(revision + 1);
    expect((await readApplications(d.storage)).applications[0]!.notes).toBe('theirs');
  });

  it('re-applies a change on top of a concurrent write instead of overwriting it', async () => {
    const d = deps();
    await recordFilledPage(d, JOB, []);
    let raced = false;
    const { result, file } = await mutateApplications(d.storage, (apps) => {
      if (!raced) {
        raced = true;
        // A concurrent writer bumps the revision after our read.
        d.storage.files.set(APPLICATIONS_FILE, new TextEncoder().encode(JSON.stringify({ rev: 5, applications: apps.map((a) => ({ ...a, notes: 'concurrent' })) })));
      }
      return { applications: apps.map((a) => ({ ...a, role: 'Mine' })), result: 'ok' };
    });
    expect(result).toBe('ok');
    expect(file.revision).toBe(6);
    expect(file.applications[0]).toMatchObject({ role: 'Mine', notes: 'concurrent' });
  });

  it('gives up after repeated conflicts', async () => {
    const d = deps();
    let rev = 0;
    const attempt = mutateApplications(d.storage, (apps) => {
      d.storage.files.set(APPLICATIONS_FILE, new TextEncoder().encode(JSON.stringify({ rev: ++rev, applications: [] })));
      return { applications: [...apps], result: null };
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationsConflictError);
  });

  it('never touches profile.json (profile edits and application edits do not conflict)', async () => {
    const folder = await memoryFolder();
    const before = folder.storage.text(PROFILE_FILE);
    const d = deps(folder.storage);
    const { application } = await recordFilledPage(d, JOB, []);
    await markApplied(d, JOB, []);
    await updateApplication(d, application.id, { status: 'interview', notes: 'x' });
    expect(folder.storage.text(PROFILE_FILE)).toBe(before);
  });

  it('writes a plain file next to profile.json on disk', async () => {
    const { dir } = await diskFolder();
    await recordFilledPage({ storage: new NodeVaultStorage(dir) }, JOB, []);
    expect(fs.readdirSync(dir).sort()).toEqual(['applications.json', 'profile.json', 'settings.json']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'applications.json'), 'utf8'))).toMatchObject({ rev: 1 });
  });
});

describe('application use cases', () => {
  it('fill -> answer inserted -> mark as applied -> status changes -> delete', async () => {
    const d = deps();
    const filled = await recordFilledPage(d, JOB, [{ label: 'First Name', value: 'Ada' }]);
    expect(filled).toMatchObject({ created: true, application: { status: 'filled' } });

    // Filling again (same posting, tracking params) updates the same record.
    const again = await recordFilledPage(d, { ...JOB, url: `${JOB.url}?utm_source=x#app` }, [{ label: 'Last Name', value: 'Lovelace' }]);
    expect(again.created).toBe(false);
    expect((await listApplications(d)).length).toBe(1);

    const answered = await recordAnswer(d, JOB.url, { label: 'Why Acme?', value: 'Logistics.' });
    expect(answered!.answers.map((a) => a.label)).toEqual(['First Name', 'Last Name', 'Why Acme?']);
    expect(await recordAnswer(d, 'https://elsewhere.com/job', { label: 'x', value: 'y' })).toBeNull();

    const applied = await markApplied(d, JOB, [{ label: 'First Name', value: 'Ada' }, { label: 'Why Acme?', value: 'Logistics!' }]);
    expect(applied.application).toMatchObject({ id: filled.application.id, status: 'applied' });
    expect(applied.application.answers).toHaveLength(2);

    const moved = await updateApplication(d, filled.application.id, { status: 'interview', notes: 'Recruiter call' });
    expect(moved.statusHistory.map((h) => h.status)).toEqual(['filled', 'applied', 'interview']);
    expect(await getApplication(d, filled.application.id)).toMatchObject({ notes: 'Recruiter call', status: 'interview' });
    await expect(updateApplication(d, filled.application.id, { status: 'hired' } as never)).rejects.toThrow();
    await expect(updateApplication(d, 'nope', { notes: 'x' })).rejects.toBeInstanceOf(ApplicationNotFoundError);

    await deleteApplication(d, filled.application.id);
    expect(await listApplications(d)).toEqual([]);
    expect((await readApplications(d.storage)).revision).toBe(6);
  });

  it('mark as applied without a prior fill creates the record', async () => {
    const d = deps();
    const { created, application } = await markApplied(d, JOB, []);
    expect(created).toBe(true);
    expect(application.statusHistory).toEqual([{ status: 'applied', at: expect.any(String) }]);
  });
});

describe('job metadata', () => {
  const frame = (fixture: string, url: string): FrameScan => ({ frameId: 0, ...scanDocument(loadFixture(fixture, url)) });

  it('reads company and role from the ATS markup (fixtures served from any host)', () => {
    expect(describeJob([frame('greenhouse.html', 'http://localhost/greenhouse.html')], ATS_ADAPTERS, 'http://localhost/greenhouse.html')).toEqual({
      url: 'http://localhost/greenhouse.html',
      company: 'Acme',
      role: 'Senior Backend Engineer',
      ats: 'greenhouse',
    });
    expect(describeJob([frame('lever.html', 'http://localhost/lever.html')], ATS_ADAPTERS, 'http://localhost/lever.html')).toMatchObject({
      company: 'Globex',
      role: 'Staff Frontend Engineer',
      ats: 'lever',
    });
    expect(describeJob([frame('ashby.html', 'http://localhost/ashby.html')], ATS_ADAPTERS, 'http://localhost/ashby.html')).toMatchObject({
      company: 'Initech',
      role: 'Product Designer',
      ats: 'ashby',
    });
  });

  it('falls back to the board slug in the URL', () => {
    const scan = frame('lever.html', 'https://jobs.lever.co/wayne-enterprises/abc-123/apply');
    scan.meta = { ...scan.meta, title: 'Apply' };
    expect(describeJob([scan], ATS_ADAPTERS, scan.url)).toMatchObject({ company: 'Wayne Enterprises', role: 'Staff Frontend Engineer' });
  });

  it('generic pages: og:title, document.title and h1', () => {
    const doc = (head: string, body: string): FrameScan => ({
      frameId: 0,
      ...scanDocument(new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, { url: 'https://careers.example.com/jobs/1' }).window.document),
    });
    expect(describeJob([doc('<title>Data Engineer at Hooli | Careers</title>', '<h1>Ignored</h1>')], ATS_ADAPTERS, '')).toMatchObject({
      company: 'Hooli',
      role: 'Data Engineer',
      ats: 'generic',
      url: 'https://careers.example.com/jobs/1',
    });
    expect(describeJob([doc('<meta property="og:title" content="Site Reliability Engineer"><meta property="og:site_name" content="Pied Piper"><title>Jobs</title>', '')], ATS_ADAPTERS, '')).toMatchObject({
      company: 'Pied Piper',
      role: 'Site Reliability Engineer',
    });
    expect(describeJob([doc('<title>Apply</title>', '<h1>Backend Developer</h1>')], ATS_ADAPTERS, '')).toMatchObject({ company: '', role: 'Backend Developer' });
  });

  it('an embedded ATS frame wins over the company site around it', () => {
    const top: FrameScan = { ...frame('ashby.html', 'https://initech.com/careers'), hints: [], meta: { title: 'Careers at Initech', ogTitle: '', ogSiteName: '', h1: 'Join us', marks: {} } };
    const embedded: FrameScan = { ...frame('greenhouse.html', 'https://boards.greenhouse.io/embed/job_app?for=acme'), frameId: 3 };
    expect(describeJob([top, embedded], ATS_ADAPTERS, 'https://initech.com/careers?gh_jid=1')).toMatchObject({
      url: 'https://initech.com/careers?gh_jid=1',
      role: 'Senior Backend Engineer',
      company: 'Acme',
      ats: 'greenhouse',
    });
  });

  it('snapshotPage scans the tab once and never reports consent fields or files', async () => {
    const doc = loadFixture('ashby.html', 'https://jobs.ashbyhq.com/initech/1/application');
    (doc.getElementById('_systemfield_email') as HTMLInputElement).value = 'ada@example.com';
    (doc.getElementById('i9-consent') as HTMLInputElement).checked = true;
    let scans = 0;
    const gateway: PageGateway = {
      scan: async () => {
        scans++;
        return [{ frameId: 0, ...scanDocument(doc) }];
      },
      apply: async () => [],
    };
    const { job, answers } = await snapshotPage(gateway, ATS_ADAPTERS, { id: 1, url: 'https://jobs.ashbyhq.com/initech/1/application' });
    expect(scans).toBe(1);
    expect(job).toMatchObject({ company: 'Initech', role: 'Product Designer', ats: 'ashby' });
    expect(answers).toEqual([{ label: 'Email', value: 'ada@example.com' }]);
  });
});
