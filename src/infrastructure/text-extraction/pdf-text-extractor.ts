import type { DocumentFile, DocumentTextExtractor } from '../../ports/document-text-extractor';

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

/** Rebuilds lines from pdf.js text items using their EOL flags and baselines. */
export function joinTextItems(items: TextItemLike[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    else if (out && !out.endsWith('\n') && !out.endsWith(' ') && item.str && !item.str.startsWith(' ')) out += ' ';
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return out;
}

/** The part of the pdf.js API used for text extraction (browser and legacy Node builds). */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; disableFontFace: boolean; useSystemFonts: boolean; stopAtErrors: boolean; verbosity: number }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): unknown }>;
    }>;
    destroy(): Promise<void>;
  };
  VerbosityLevel: { ERRORS: number };
}

export const MAX_PDF_PAGES = 20;

/** Text of the first pages of a PDF, shared by the browser and Node extractors. */
export async function readPdfText(pdfjs: PdfJsLike, bytes: Uint8Array): Promise<string> {
  // pdf.js transfers the buffer to the worker, so give it a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    // Text extraction does not need font files; silence "standardFontDataUrl" warnings.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items as TextItemLike[]));
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

/** True for files the PDF extractors handle. */
export function isPdf(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
  return file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.fileName);
}

/**
 * PDF text via pdf.js. The worker is bundled with the extension (Vite `?url`
 * asset) because MV3's CSP forbids loading scripts from remote origins.
 * Both modules are loaded lazily so they only weigh on the CV import flow.
 */
export class PdfTextExtractor implements DocumentTextExtractor {
  canExtract(file: Pick<DocumentFile, 'fileName' | 'mimeType'>): boolean {
    return isPdf(file);
  }

  async extractText(file: DocumentFile): Promise<string> {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return readPdfText(pdfjs as unknown as PdfJsLike, file.bytes);
  }
}
