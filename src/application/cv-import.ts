import {
  buildCvExtractionPrompt,
  extractCvBasics,
  groundExtraction,
  parseCvExtractionResponse,
  type CvExtraction,
} from '../domain/cv-extraction';
import type { Profile } from '../domain/profile';
import type { DocumentFile, DocumentTextExtractor } from '../ports/document-text-extractor';
import type { LlmProvider } from '../ports/llm-provider';
import type { ProfileSession } from '../ports/session-store';
import { readProfileRevision, requireSession, saveProfile, storeDocument, VaultConflictError, VaultError, type VaultDeps } from './vault';

export const MAX_CV_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_CHARS = 40;

export class CvTextError extends VaultError {
  constructor(message: string) {
    super(message);
    this.name = 'CvTextError';
  }
}

/** Reads the CV text locally. Nothing leaves the browser here. */
export async function readCvText(extractor: DocumentTextExtractor, file: DocumentFile): Promise<string> {
  if (file.bytes.byteLength > MAX_CV_BYTES) throw new CvTextError('Files over 10 MB are not supported.');
  const text = (await extractor.extractText(file)).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < MIN_TEXT_CHARS) {
    throw new CvTextError('No readable text was found in this file. Scanned (image-only) PDFs are not supported; try a DOCX or a text-based PDF.');
  }
  return text;
}

export type ExtractionMethod = 'ai' | 'basic';

export interface CvExtractionResult {
  extraction: CvExtraction;
  method: ExtractionMethod;
}

/**
 * Turns CV text into structured data. With an LLM, the model output is
 * validated, clamped and grounded against the CV text (contact details the
 * model invented are dropped). Without one, a deterministic regex pass runs.
 */
export async function extractProfileFromCv(
  text: string,
  llm: LlmProvider | null,
  signal?: AbortSignal,
): Promise<CvExtractionResult> {
  if (!llm) return { extraction: extractCvBasics(text), method: 'basic' };
  const raw = await llm.complete(buildCvExtractionPrompt(text), { format: 'json', maxTokens: 8192, signal });
  return { extraction: groundExtraction(parseCvExtractionResponse(raw), text), method: 'ai' };
}

/**
 * Saves the reviewed profile and (optionally) the original CV, copied into documents/, as
 * the default resume. One profile write at the end, after the document is on disk.
 */
export async function saveCvImport(
  deps: VaultDeps,
  input: { profile: Profile; cv: DocumentFile | null; baseRevision?: number },
): Promise<ProfileSession> {
  const session = await requireSession(deps.session);
  // Documents are written straight to disk elsewhere, so the session list is the source of truth.
  let profile: Profile = { ...input.profile, documents: session.profile.documents };
  let stored: string | null = null;
  if (input.cv) {
    const cv = input.cv;
    const existing = profile.documents.find((d) => d.kind === 'cv' && d.fileName === cv.fileName && d.size === cv.bytes.byteLength);
    // Refuse before writing the document if the profile changed since the review started.
    if (!existing && input.baseRevision !== undefined) {
      const current = await readProfileRevision(deps);
      if (current !== input.baseRevision) throw new VaultConflictError(current);
    }
    const ref = existing ?? (await storeDocument(deps, { kind: 'cv', ...cv }));
    if (!existing) stored = ref.storedAs;
    profile = {
      ...profile,
      documents: existing ? profile.documents : [...profile.documents, ref],
      defaultResumeId: ref.id,
    };
  }
  try {
    return await saveProfile(deps, profile, input.baseRevision);
  } catch (error) {
    if (stored) await deps.storage.remove(stored).catch(() => undefined);
    throw error;
  }
}
