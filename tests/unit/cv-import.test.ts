import { describe, expect, it, vi } from 'vitest';
import { extractProfileFromCv, readCvText, saveCvImport } from '../../src/application/cv-import';
import { createProfile, openProfile, readDocument } from '../../src/application/vault';
import { CompositeTextExtractor } from '../../src/infrastructure/text-extraction';
import { PlainTextExtractor } from '../../src/infrastructure/text-extraction/plain-text-extractor';
import { joinTextItems } from '../../src/infrastructure/text-extraction/pdf-text-extractor';
import type { LlmProvider } from '../../src/ports/llm-provider';
import { UnsupportedDocumentError } from '../../src/ports/document-text-extractor';
import { utf8 } from '../../src/shared/encoding';
import { memoryDeps } from '../helpers/vault';

const CV_TEXT = 'Grace Hopper\nRear Admiral\ngrace@navy.example · +1 202 555 0147\n\nExperience\nUS Navy, Programmer, 1943 - 1986';

const mockLlm = (reply: string): LlmProvider & { complete: ReturnType<typeof vi.fn> } => ({ id: 'mock', complete: vi.fn(async () => reply) });

describe('CV import use cases', () => {
  it('reads plain text locally and rejects unsupported or empty files', async () => {
    const extractor = new CompositeTextExtractor([new PlainTextExtractor()]);
    const file = { fileName: 'cv.txt', mimeType: 'text/plain', bytes: utf8.encode(`${CV_TEXT}\r\n\r\n\r\n\r\nend`) };
    expect(await readCvText(extractor, file)).toBe(`${CV_TEXT}\n\nend`);
    await expect(readCvText(extractor, { ...file, fileName: 'cv.doc', mimeType: 'application/msword' })).rejects.toBeInstanceOf(UnsupportedDocumentError);
    await expect(readCvText(extractor, { ...file, bytes: utf8.encode('  ') })).rejects.toThrow(/No readable text/);
  });

  it('uses the regex fallback without an LLM', async () => {
    const r = await extractProfileFromCv(CV_TEXT, null);
    expect(r.method).toBe('basic');
    expect(r.extraction.personal).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.example' });
  });

  it('asks the LLM for JSON and validates + grounds the answer', async () => {
    const llm = mockLlm('```json\n{"personal":{"firstName":"Grace","lastName":"Hopper","email":"made-up@x.com"},"experience":[{"company":"US Navy","title":"Programmer","startDate":"1943","endDate":"1986"}]}\n```');
    const r = await extractProfileFromCv(CV_TEXT, llm);
    expect(r.method).toBe('ai');
    expect(llm.complete).toHaveBeenCalledWith(expect.objectContaining({ user: expect.stringContaining('Grace Hopper') }), expect.objectContaining({ format: 'json' }));
    expect(r.extraction.personal.email).toBe('grace@navy.example');
    expect(r.extraction.experience[0]).toMatchObject({ company: 'US Navy', startDate: '1943', endDate: '1986' });
  });

  it('copies the CV into documents/ as the default resume and saves the profile in one go', async () => {
    const d = memoryDeps();
    const session = await createProfile(d);
    const cvBytes = utf8.encode(CV_TEXT);
    const profile = { ...session.profile, personal: { ...session.profile.personal, firstName: 'Grace' } };
    const saved = await saveCvImport(d, { profile, cv: { fileName: 'grace.txt', mimeType: 'text/plain', bytes: cvBytes } });

    const [doc] = saved.profile.documents;
    expect(doc).toMatchObject({ kind: 'cv', fileName: 'grace.txt', size: cvBytes.byteLength });
    expect(saved.profile.defaultResumeId).toBe(doc!.id);
    expect(doc!.storedAs).toMatch(/^documents\/grace-[0-9a-f]{8}\.txt$/);
    expect(d.storage.text(doc!.storedAs)).toBe(CV_TEXT);
    expect(utf8.decode((await readDocument(d, doc!.id)).bytes)).toBe(CV_TEXT);

    // Importing the same file again does not store a second copy.
    const again = await saveCvImport(d, { profile: saved.profile, cv: { fileName: 'grace.txt', mimeType: 'text/plain', bytes: cvBytes } });
    expect(again.profile.documents).toHaveLength(1);

    await d.session.clear();
    const reopened = await openProfile(d);
    expect(reopened.profile.personal.firstName).toBe('Grace');
    expect(reopened.profile.defaultResumeId).toBe(doc!.id);
  });
});

describe('pdf text joining', () => {
  it('breaks lines on EOL flags and baseline changes', () => {
    const items = [
      { str: 'Grace', transform: [1, 0, 0, 1, 0, 700] },
      { str: 'Hopper', transform: [1, 0, 0, 1, 40, 700], hasEOL: true },
      { str: 'Rear Admiral', transform: [1, 0, 0, 1, 0, 680] },
      { str: 'grace@navy.example', transform: [1, 0, 0, 1, 0, 660] },
    ];
    expect(joinTextItems(items)).toBe('Grace Hopper\nRear Admiral\ngrace@navy.example');
  });
});
