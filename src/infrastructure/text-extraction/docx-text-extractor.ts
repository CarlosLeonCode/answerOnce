import type { DocumentFile, DocumentTextExtractor } from '../../ports/document-text-extractor';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Word .docx text via mammoth (loaded lazily). Legacy binary .doc is not supported.
 * Works in the extension and in Node (answeronce-mcp): mammoth's browser build reads
 * `arrayBuffer`, its Node build reads `buffer` (JSZip accepts an ArrayBuffer for both).
 */
export class DocxTextExtractor implements DocumentTextExtractor {
  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
    return file.mimeType === DOCX_MIME || /\.docx$/i.test(file.fileName);
  }

  async extractText(file: DocumentFile): Promise<string> {
    const mammoth = await import('mammoth');
    const buffer = file.bytes.slice().buffer;
    const input = { arrayBuffer: buffer, buffer } as unknown as { arrayBuffer: ArrayBuffer };
    const result = await (mammoth.default ?? mammoth).extractRawText(input);
    return result.value;
  }
}
