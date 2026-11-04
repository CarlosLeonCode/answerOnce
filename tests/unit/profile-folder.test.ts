import { describe, expect, it } from 'vitest';
import {
  addDocument,
  createProfile,
  documentPath,
  inspectFolder,
  openProfile,
  readDocument,
  readProfileRevision,
  removeDocument,
  saveProfile,
  syncSession,
  VaultConflictError,
} from '../../src/application/vault';
import { PROFILE_FILE, SETTINGS_FILE } from '../../src/ports/vault-storage';
import { utf8 } from '../../src/shared/encoding';
import { sampleProfile } from '../helpers/dom';
import { memoryDeps, memoryFolder, otherWriter, type MemoryDeps } from '../helpers/vault';

const fileJson = (deps: MemoryDeps, name: string) => JSON.parse(deps.storage.text(name)!) as Record<string, unknown>;

function withApiKey() {
  const p = sampleProfile();
  p.ai = { provider: 'openai', model: 'gpt-x', apiKey: 'sk-SECRET-API-KEY', ollamaBaseUrl: 'http://localhost:11434' };
  return p;
}

describe('profile folder files', () => {
  it('writes profile.json as pretty-printed, readable JSON with the revision first', async () => {
    const deps = await memoryFolder(); // create (rev 1) + save (rev 2)
    const text = deps.storage.text(PROFILE_FILE)!;
    expect(text).toMatch(/^\{\n {2}"rev": 2,\n {2}"schemaVersion": 3,/);
    expect(text.endsWith('}\n')).toBe(true);
    expect(fileJson(deps, PROFILE_FILE)).toMatchObject({ personal: { firstName: 'Ada', email: 'ada@example.com' }, agentProposals: [], agents: { directWrite: false } });
    const session = await saveProfile(deps, { ...sampleProfile(), headline: 'Mathematician' });
    expect(session.revision).toBe(3);
    expect(await readProfileRevision(deps)).toBe(3);
    expect(deps.storage.text(PROFILE_FILE)).toContain('"headline": "Mathematician"');
  });

  it('keeps AI settings and API keys in settings.json, never in profile.json', async () => {
    const deps = await memoryFolder(withApiKey());
    expect(deps.storage.text(PROFILE_FILE)).not.toMatch(/sk-SECRET-API-KEY|gpt-x|"ai"/);
    expect(fileJson(deps, SETTINGS_FILE)).toEqual({
      ai: { provider: 'openai', model: 'gpt-x', apiKey: 'sk-SECRET-API-KEY', ollamaBaseUrl: 'http://localhost:11434' },
      agentSetup: { profileFolder: '', nodePath: '' },
    });

    // The extension reads both files back.
    await deps.session.clear();
    expect((await openProfile(deps)).profile.ai.apiKey).toBe('sk-SECRET-API-KEY');

    // An agent (withSettings: false) never sees them, and its writes leave settings.json alone.
    const agent = otherWriter(deps);
    const loaded = await openProfile(agent);
    expect(loaded.profile.ai).toMatchObject({ provider: 'none', apiKey: '' });
    const settingsBefore = deps.storage.text(SETTINGS_FILE);
    await saveProfile(agent, { ...loaded.profile, headline: 'From the agent' });
    expect(deps.storage.text(SETTINGS_FILE)).toBe(settingsBefore);
    expect((await syncSession(deps)).session?.profile).toMatchObject({ headline: 'From the agent', ai: { apiKey: 'sk-SECRET-API-KEY' } });
  });

  it('keeps agent setup paths in settings.json; settings files without them stay valid', async () => {
    const deps = memoryDeps();
    // A settings.json written before agentSetup existed.
    await deps.storage.writeText(SETTINGS_FILE, JSON.stringify({ ai: { provider: 'ollama' } }));
    await deps.storage.writeText(PROFILE_FILE, JSON.stringify({ rev: 1, personal: { firstName: 'Grace' } }));
    const session = await openProfile(deps);
    expect(session.profile).toMatchObject({ ai: { provider: 'ollama' }, agentSetup: { profileFolder: '', nodePath: '' } });

    const agentSetup = { profileFolder: '/Users/grace/My AnswerOnce', nodePath: '/opt/node/bin/node' };
    await saveProfile(deps, { ...session.profile, agentSetup });
    expect(fileJson(deps, SETTINGS_FILE)).toMatchObject({ ai: { provider: 'ollama' }, agentSetup });
    expect(deps.storage.text(PROFILE_FILE)).not.toMatch(/agentSetup|My AnswerOnce/);

    await deps.session.clear();
    expect((await openProfile(deps)).profile.agentSetup).toEqual(agentSetup);
    // An agent never sees them.
    expect((await openProfile(otherWriter(deps))).profile.agentSetup.profileFolder).toBe('');
  });

  it('reads settings.json files with the project path of older versions and drops it on the next save', async () => {
    const deps = memoryDeps();
    await deps.storage.writeText(SETTINGS_FILE, JSON.stringify({ ai: { provider: 'ollama' }, agentSetup: { projectPath: '/Users/grace/code/answeronce', profileFolder: '/Users/grace/answeronce', nodePath: '' } }));
    await deps.storage.writeText(PROFILE_FILE, JSON.stringify({ rev: 1, personal: { firstName: 'Grace' } }));
    const session = await openProfile(deps);
    expect(session.profile.agentSetup).toEqual({ profileFolder: '/Users/grace/answeronce', nodePath: '' });
    await saveProfile(deps, session.profile);
    expect(fileJson(deps, SETTINGS_FILE)).toEqual({ ai: expect.objectContaining({ provider: 'ollama' }), agentSetup: { profileFolder: '/Users/grace/answeronce', nodePath: '' } });
  });

  it('ignores AI settings written into profile.json by hand and accepts a missing rev', async () => {
    const deps = memoryDeps();
    await deps.storage.writeText(PROFILE_FILE, JSON.stringify({ personal: { firstName: 'Grace' }, ai: { apiKey: 'leaked' } }));
    const session = await openProfile(deps);
    expect(session).toMatchObject({ revision: 0, profile: { personal: { firstName: 'Grace' }, ai: { apiKey: '' } } });
    await saveProfile(deps, session.profile);
    expect(fileJson(deps, PROFILE_FILE).rev).toBe(1);
    expect(deps.storage.text(PROFILE_FILE)).not.toContain('leaked');
  });

  it('reports invalid files clearly', async () => {
    const deps = memoryDeps();
    await deps.storage.writeText(PROFILE_FILE, '{ not json');
    await expect(openProfile(deps)).rejects.toThrow(/profile.json is not valid JSON/);
    await deps.storage.writeText(PROFILE_FILE, JSON.stringify({ rev: -1 }));
    await expect(openProfile(deps)).rejects.toThrow(/invalid "rev"/);
  });

  it('inspects the folder and refuses to create a second profile', async () => {
    const deps = memoryDeps();
    expect(await inspectFolder(deps.storage, 'old.file')).toBe('empty');
    await deps.storage.writeText('old.file', '{}');
    expect(await inspectFolder(deps.storage, 'old.file')).toBe('legacy');
    await createProfile(deps);
    expect(await inspectFolder(deps.storage, 'old.file')).toBe('profile');
    await expect(createProfile(deps)).rejects.toThrow(/already contains a profile.json/);
  });

  it('stores documents as real files under documents/ with readable names', async () => {
    const deps = await memoryFolder();
    const bytes = utf8.encode('%PDF-1.7 Ada Lovelace CV');
    const session = await addDocument(deps, { kind: 'cv', fileName: 'Ada Lovelace CV (2026).PDF', mimeType: 'application/pdf', bytes });
    const doc = session.profile.documents.at(-1)!;
    expect(doc.storedAs).toMatch(/^documents\/Ada-Lovelace-CV-2026-[0-9a-f]{8}\.pdf$/);
    expect(deps.storage.text(doc.storedAs)).toBe('%PDF-1.7 Ada Lovelace CV');
    expect(fileJson(deps, PROFILE_FILE).documents).toEqual(expect.arrayContaining([expect.objectContaining({ id: doc.id, fileName: 'Ada Lovelace CV (2026).PDF', storedAs: doc.storedAs })]));
    expect(utf8.decode((await readDocument(deps, doc.id)).bytes)).toBe('%PDF-1.7 Ada Lovelace CV');

    await removeDocument(deps, doc.id);
    expect(deps.storage.files.has(doc.storedAs)).toBe(false);
    expect(documentPath('../../etc/passwd', 'abcdef123456')).toBe('documents/etc-passwd-abcdef12');
  });
});

describe('profile revision (optimistic concurrency)', () => {
  it('refuses to overwrite a newer revision written by another writer', async () => {
    const extension = await memoryFolder();
    const agent = otherWriter(extension);
    await openProfile(agent);

    await saveProfile(agent, { ...sampleProfile(), headline: 'From the agent' });
    const error = await saveProfile(extension, { ...sampleProfile(), headline: 'From the extension' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultConflictError);
    expect((error as VaultConflictError).currentRevision).toBe(3);

    // An explicit stale base revision is refused too.
    await expect(saveProfile(agent, sampleProfile(), 1)).rejects.toBeInstanceOf(VaultConflictError);
  });

  it('syncSession reloads only when the revision changed', async () => {
    const extension = await memoryFolder();
    const agent = otherWriter(extension);
    await openProfile(agent);

    expect((await syncSession(extension)).changed).toBe(false);
    await saveProfile(agent, { ...sampleProfile(), headline: 'Updated by agent' });
    const synced = await syncSession(extension);
    expect(synced.changed).toBe(true);
    expect(synced.session?.profile.headline).toBe('Updated by agent');
    expect(synced.session?.revision).toBe(3);
    // Now the extension can save on top of it.
    await expect(saveProfile(extension, synced.session!.profile)).resolves.toMatchObject({ revision: 4 });
  });
});
