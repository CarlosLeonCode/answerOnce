import type { DocumentTextExtractor } from '../../ports/document-text-extractor';
import { CompositeTextExtractor } from './composite-text-extractor';
import { DocxTextExtractor } from './docx-text-extractor';
import { NodePdfTextExtractor } from './node-pdf-text-extractor';
import { PlainTextExtractor } from './plain-text-extractor';

/** Local text extraction for Node (answeronce-mcp): PDF, DOCX, TXT and Markdown. */
export function createNodeTextExtractor(): DocumentTextExtractor {
  return new CompositeTextExtractor([new NodePdfTextExtractor(), new DocxTextExtractor(), new PlainTextExtractor()]);
}
