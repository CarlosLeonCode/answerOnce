import { UnsupportedDocumentError, type DocumentFile, type DocumentTextExtractor } from '../../ports/document-text-extractor';

/** Delegates to the first extractor that supports the file. */
export class CompositeTextExtractor implements DocumentTextExtractor {
  constructor(private readonly extractors: readonly DocumentTextExtractor[]) {}

  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
    return this.extractors.some((e) => e.canExtract(file));
  }

  async extractText(file: DocumentFile): Promise<string> {
    const extractor = this.extractors.find((e) => e.canExtract(file));
    if (!extractor) throw new UnsupportedDocumentError(file.fileName);
    return extractor.extractText(file);
  }
}
