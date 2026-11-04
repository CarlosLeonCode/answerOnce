import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCvText } from '../../src/application/cv-import';
import { createNodeTextExtractor } from '../../src/infrastructure/text-extraction/node';
import { utf8 } from '../../src/shared/encoding';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const file = (name: string, mimeType: string) => ({ fileName: name, mimeType, bytes: new Uint8Array(fs.readFileSync(path.join(FIXTURES, name))) });

describe('CV text extraction in Node (answeronce-mcp)', () => {
  const extractor = createNodeTextExtractor();

  it('reads a PDF with the pdf.js legacy build', async () => {
    const text = await readCvText(extractor, file('sample-cv.pdf', 'application/pdf'));
    expect(text).toContain('Jordan Rivera');
    expect(text).toContain('jordan.rivera@example.com');
    expect(text).toContain('Lumen Analytics');
  });

  it('reads a DOCX with mammoth', async () => {
    const text = await readCvText(extractor, file('sample-cv.docx', ''));
    expect(text).toContain('Jordan Rivera');
    expect(text).toContain('Universidade de Lisboa');
  });

  it('reads Markdown and rejects unsupported types', async () => {
    const md = { fileName: 'cv.md', mimeType: '', bytes: utf8.encode('# Grace Hopper\n\nRear Admiral, programmer of the Harvard Mark I computer.') };
    expect(await readCvText(extractor, md)).toContain('Grace Hopper');
    await expect(readCvText(extractor, { ...md, fileName: 'cv.doc' })).rejects.toThrow(/Unsupported file type/);
  });
});
