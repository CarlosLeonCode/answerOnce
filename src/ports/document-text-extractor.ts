/** A file picked by the user, held in memory only. */
export interface DocumentFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Extracts plain text from a document locally (no network). */
export interface DocumentTextExtractor {
  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean;
  extractText(file: DocumentFile): Promise<string>;
}

export class UnsupportedDocumentError extends Error {
  constructor(fileName: string) {
    super(`Unsupported file type: ${fileName}. Use a PDF, DOCX, TXT or Markdown file.`);
    this.name = 'UnsupportedDocumentError';
  }
}
