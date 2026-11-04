import { findSavedAnswer } from '../domain/answer-memory';
import { isConsentField } from '../domain/consent';
import { isEmptyValue, isOpenEnded, type FieldDescriptor, type FrameScan } from '../domain/field';
import { pickOption, resolveValue, type FieldMatch, type FillInstruction, type FillResult, type FillValue } from '../domain/fill';
import type { Profile } from '../domain/profile';
import { matchBySynonyms } from '../domain/synonyms';
import type { AtsAdapter } from '../ports/ats-adapter';
import type { PageGateway } from '../ports/page-gateway';
import { bytesToBase64 } from '../shared/encoding';

export interface UnmatchedField {
  field: FieldDescriptor;
  frameId: number;
  /** True for free-text questions where "Generate with AI" makes sense. */
  openEnded: boolean;
}

export interface FillPlan {
  ats: string;
  matches: FieldMatch[];
  unmatched: UnmatchedField[];
  /** Fields skipped because they already had a value (and overwrite was off). */
  prefilled: { field: FieldDescriptor; frameId: number }[];
  /** Consent, legal and opt-in fields. Never filled: always left to the user. */
  consent: { field: FieldDescriptor; frameId: number }[];
  jobText: string;
}

function textForMemory(field: FieldDescriptor, answer: string): FillValue {
  if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') {
    return { type: 'choice', candidates: [answer] };
  }
  if (field.kind === 'checkbox' && field.options.length === 0) {
    return { type: 'bool', value: /^(yes|si|sí|true)$/i.test(answer.trim()) };
  }
  return { type: 'text', text: answer };
}

/** For choice fields with known options, keep only matches that can actually be picked. */
function isApplicable(field: FieldDescriptor, value: FillValue): boolean {
  if (value.type !== 'choice' || field.options.length === 0) return true;
  return pickOption(field.options, value.candidates) !== null;
}

/**
 * Pure matching pipeline: consent guard -> ATS adapter -> synonym rules ->
 * saved answers -> unmatched. Consent fields never reach matching, saved
 * answers or AI.
 */
export function planFill(
  scans: FrameScan[],
  profile: Profile,
  adapters: readonly AtsAdapter[],
  options: { overwrite: boolean },
): FillPlan {
  const plan: FillPlan = { ats: 'generic', matches: [], unmatched: [], prefilled: [], consent: [], jobText: '' };
  const jobTexts: string[] = [];

  for (const scan of scans) {
    const adapter = adapters.find((a) => a.detect(scan));
    if (adapter && adapter.id !== 'generic') plan.ats = adapter.name;
    if (scan.jobText) jobTexts.push(scan.jobText);

    for (const field of scan.fields) {
      if (isConsentField(field)) {
        plan.consent.push({ field, frameId: scan.frameId });
        continue;
      }
      if (!options.overwrite && !isEmptyValue(field) && field.kind !== 'combobox') {
        plan.prefilled.push({ field, frameId: scan.frameId });
        continue;
      }
      const atsKey = adapter?.mapField(field) ?? null;
      const synonym = atsKey ? null : matchBySynonyms(field);
      const key = atsKey ?? synonym?.key ?? null;
      if (key) {
        const value = resolveValue(profile, key, field);
        if (value && isApplicable(field, value)) {
          plan.matches.push({ field, frameId: scan.frameId, key, source: atsKey ? 'ats' : 'synonym', value });
          continue;
        }
      }
      const label = field.label || field.ariaLabel || field.placeholder;
      const hit = label && field.kind !== 'file' ? findSavedAnswer(label, profile.savedAnswers) : null;
      if (hit) {
        const value = textForMemory(field, hit.answer.answer);
        if (isApplicable(field, value)) {
          plan.matches.push({ field, frameId: scan.frameId, key: null, source: 'memory', value, memoryLabel: hit.answer.label });
          continue;
        }
      }
      plan.unmatched.push({ field, frameId: scan.frameId, openEnded: isOpenEnded(field) });
    }
  }
  plan.jobText = jobTexts.sort((a, b) => b.length - a.length)[0] ?? '';
  return plan;
}

export interface FillPageDeps {
  gateway: PageGateway;
  adapters: readonly AtsAdapter[];
  /** Loads a document from the profile folder. */
  loadDocument: (documentId: string) => Promise<{ fileName: string; mimeType: string; bytes: Uint8Array }>;
}

export interface FillReport {
  plan: FillPlan;
  results: Map<string, FillResult>;
}

async function toInstruction(match: FieldMatch, deps: FillPageDeps): Promise<FillInstruction> {
  const v = match.value;
  if (v.type === 'file') {
    const doc = await deps.loadDocument(v.documentId);
    return { uid: match.field.uid, value: { type: 'file', fileName: doc.fileName, mimeType: doc.mimeType, base64: bytesToBase64(doc.bytes) } };
  }
  return { uid: match.field.uid, value: v };
}

/** Scans the tab, plans, and applies matched values frame by frame. Never submits. */
export async function fillPage(
  deps: FillPageDeps,
  tabId: number,
  profile: Profile,
  options: { overwrite: boolean },
): Promise<FillReport> {
  const scans = await deps.gateway.scan(tabId);
  const plan = planFill(scans, profile, deps.adapters, options);
  const results = new Map<string, FillResult>();
  const byFrame = new Map<number, FieldMatch[]>();
  for (const m of plan.matches) byFrame.set(m.frameId, [...(byFrame.get(m.frameId) ?? []), m]);

  for (const [frameId, matches] of byFrame) {
    const instructions: FillInstruction[] = [];
    for (const m of matches) {
      try {
        instructions.push(await toInstruction(m, deps));
      } catch (error) {
        results.set(m.field.uid, { uid: m.field.uid, status: 'failed', detail: (error as Error).message });
      }
    }
    const frameResults = await deps.gateway.apply(tabId, frameId, instructions, options);
    for (const r of frameResults) results.set(r.uid, r);
  }
  return { plan, results };
}

/** Fills a single field with a user-approved value (e.g. an AI answer). */
export async function fillSingleField(
  gateway: PageGateway,
  tabId: number,
  frameId: number,
  field: FieldDescriptor,
  answer: string,
): Promise<FillResult> {
  const [result] = await gateway.apply(tabId, frameId, [{ uid: field.uid, value: textForMemory(field, answer) as FillInstruction['value'] }], {
    overwrite: true,
  });
  return result ?? { uid: field.uid, status: 'not-found' };
}
