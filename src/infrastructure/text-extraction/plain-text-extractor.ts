import type { DocumentFile, DocumentTextExtractor } from '../../ports/document-text-extractor';

export class PlainTextExtractor implements DocumentTextExtractor {
  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
    return /^text\/(plain|markdown)$/.test(file.mimeType) || /\.(txt|md|markdown|text)$/i.test(file.fileName);
  }

  async extractText(file: DocumentFile): Promise<string> {
    return new TextDecoder('utf-8').decode(file.bytes);
  }
}
