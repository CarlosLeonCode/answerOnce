import type { DocumentFile, DocumentTextExtractor } from '../../ports/document-text-extractor';
import { isPdf, readPdfText, type PdfJsLike } from './pdf-text-extractor';

let loaded: Promise<PdfJsLike> | null = null;

/**
 * pdf.js legacy build for Node. Its worker module is imported into the same
 * process and exposed as `globalThis.pdfjsWorker`, which pdf.js uses instead
 * of spawning a worker, so the code can be bundled into one file.
 */
function loadPdfJs(): Promise<PdfJsLike> {
  loaded ??= (async () => {
    // On load, pdf.js warns that it cannot polyfill canvas APIs (only needed for rendering).
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (!/Cannot (load "@napi-rs\/canvas"|polyfill)/.test(String(args[0]))) warn(...args);
    };
    try {
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
      return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
    } finally {
      console.warn = warn;
    }
  })();
  return loaded;
}

/** PDF text in Node (answeronce-mcp). Same page handling as the extension's extractor. */
export class NodePdfTextExtractor implements DocumentTextExtractor {
  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
    return isPdf(file);
  }

  async extractText(file: DocumentFile): Promise<string> {
    return readPdfText(await loadPdfJs(), file.bytes);
  }
}
