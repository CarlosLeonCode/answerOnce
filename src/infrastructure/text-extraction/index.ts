import type { DocumentTextExtractor } from '../../ports/document-text-extractor';
import { CompositeTextExtractor } from './composite-text-extractor';
import { DocxTextExtractor } from './docx-text-extractor';
import { PdfTextExtractor } from './pdf-text-extractor';
import { PlainTextExtractor } from './plain-text-extractor';

/** File types the CV import accepts (for <input accept>). */
export const CV_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

export { CompositeTextExtractor };

export function createTextExtractor(): DocumentTextExtractor {
  return new CompositeTextExtractor([new PdfTextExtractor(), new DocxTextExtractor(), new PlainTextExtractor()]);
}
