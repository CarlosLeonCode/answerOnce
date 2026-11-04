import { pickOption } from '../domain/choice';
import { isConsentText } from '../domain/consent';
import type { FillInstruction, FillResult } from '../domain/fill';
import { base64ToBytes } from '../shared/encoding';
import { UID_ATTR, isPlaceholderOption } from './detector';
import { cleanText, resolveLabel } from './label';

const FILLED_ATTR = 'data-answeronce-filled';
const HIGHLIGHT = '2px solid rgba(34, 197, 94, 0.55)';

export interface ApplyOptions {
  overwrite: boolean;
}

function win(el: Element): Window & typeof globalThis {
  return el.ownerDocument.defaultView as Window & typeof globalThis;
}

function fire(el: Element, type: string): void {
  const w = win(el);
  const event = type === 'input' ? new w.Event('input', { bubbles: true, composed: true }) : new w.Event(type, { bubbles: true });
  el.dispatchEvent(event);
}

/**
 * Sets a value the way React/Vue-controlled inputs expect: call the native
 * prototype setter (bypassing framework-patched instance setters) and dispatch
 * bubbling `input` and `change` events.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const w = win(el);
  const proto =
    el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  fire(el, 'input');
  fire(el, 'change');
}

function highlight(el: Element): void {
  el.setAttribute(FILLED_ATTR, 'true');
  const target = (el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox' ? (el.closest('label') ?? el) : el;
  (target as HTMLElement).style.outline = HIGHLIGHT;
  (target as HTMLElement).style.outlineOffset = '1px';
}

function blur(el: Element): void {
  const w = win(el);
  el.dispatchEvent(new w.FocusEvent('blur'));
  el.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }));
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, text: string, opts: ApplyOptions): FillResult['status'] {
  if (el.value.trim() && !opts.overwrite) return 'skipped-nonempty';
  el.focus?.();
  setNativeValue(el, text);
  blur(el);
  return el.value === text || el.type === 'number' ? 'filled' : 'failed';
}

function fillSelect(el: HTMLSelectElement, candidates: string[], opts: ApplyOptions): FillResult['status'] {
  const current = el.selectedOptions[0];
  if (current && !isPlaceholderOption(current) && !opts.overwrite) return 'skipped-nonempty';
  const options = Array.from(el.options).filter((o) => !isPlaceholderOption(o));
  const texts = options.map((o) => cleanText(o.text));
  const picked = pickOption(texts, candidates) ?? pickOption(options.map((o) => o.value), candidates);
  if (!picked) return 'failed';
  const option = options.find((o) => cleanText(o.text) === picked || o.value === picked);
  if (!option) return 'failed';
  setNativeValue(el, option.value);
  return el.value === option.value ? 'filled' : 'failed';
}

function groupInputs(doc: Document, uid: string): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>(`input[${UID_ATTR}="${uid}"]`));
}

function fillChoiceGroup(inputs: HTMLInputElement[], candidates: string[], opts: ApplyOptions): FillResult['status'] {
  if (inputs.some((i) => i.checked) && !opts.overwrite) return 'skipped-nonempty';
  const labels = inputs.map((i) => resolveLabel(i) || i.value);
  const picked = pickOption(labels, candidates) ?? pickOption(inputs.map((i) => i.value), candidates);
  if (!picked) return 'failed';
  const idx = labels.indexOf(picked) >= 0 ? labels.indexOf(picked) : inputs.findIndex((i) => i.value === picked);
  const target = inputs[idx];
  if (!target) return 'failed';
  if (!target.checked) target.click();
  if (!target.checked) {
    target.checked = true;
    fire(target, 'input');
    fire(target, 'change');
  }
  highlight(target);
  return 'filled';
}

function fillCheckbox(el: HTMLInputElement, value: boolean, opts: ApplyOptions): FillResult['status'] {
  if (el.checked && !opts.overwrite) return 'skipped-nonempty';
  if (el.checked !== value) el.click();
  if (el.checked !== value) {
    el.checked = value;
    fire(el, 'change');
  }
  return 'filled';
}

function fillFile(
  el: HTMLInputElement,
  file: { fileName: string; mimeType: string; base64: string },
  opts: ApplyOptions,
): FillResult['status'] {
  if (el.files?.length && !opts.overwrite) return 'skipped-nonempty';
  const w = win(el);
  if (typeof w.DataTransfer !== 'function') return 'failed';
  const transfer = new w.DataTransfer();
  transfer.items.add(new w.File([base64ToBytes(file.base64)], file.fileName, { type: file.mimeType }));
  el.files = transfer.files;
  fire(el, 'input');
  fire(el, 'change');
  return el.files?.length ? 'filled' : 'failed';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visibleOptions(doc: Document, el: Element): HTMLElement[] {
  const listId = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  const scope = (listId && doc.getElementById(listId)) || doc;
  return Array.from(scope.querySelectorAll<HTMLElement>('[role="option"]'));
}

function press(el: Element, key: string): void {
  const w = win(el);
  for (const type of ['keydown', 'keyup']) {
    el.dispatchEvent(new w.KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  }
}

/** Best effort for custom comboboxes (react-select & co): open, type, pick option. */
async function fillCombobox(el: HTMLElement, candidates: string[], opts: ApplyOptions): Promise<FillResult['status']> {
  const doc = el.ownerDocument;
  const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null;
  // react-select style widgets render the chosen value in a sibling element.
  const container = el.closest('[class*="container" i]') ?? el.parentElement?.parentElement;
  const selected = container?.querySelector('[class*="singleValue" i], [class*="single-value" i], [class*="multiValue" i]');
  if (!opts.overwrite && ((selected && cleanText(selected.textContent)) || input?.value.trim())) return 'skipped-nonempty';
  el.focus?.();
  el.dispatchEvent(new (win(el).MouseEvent)('mousedown', { bubbles: true }));
  el.click();
  for (const candidate of candidates.slice(0, 3)) {
    if (input) setNativeValue(input, candidate);
    for (let i = 0; i < 8; i++) {
      await sleep(120);
      const options = visibleOptions(doc, el);
      const texts = options.map((o) => cleanText(o.textContent));
      const picked = pickOption(texts, [candidate, ...candidates]);
      if (picked) {
        const option = options[texts.indexOf(picked)]!;
        option.dispatchEvent(new (win(el).MouseEvent)('mousedown', { bubbles: true }));
        option.click();
        return 'filled';
      }
    }
  }
  if (input) setNativeValue(input, '');
  press(el, 'Escape');
  return 'failed';
}

/**
 * Second line of defense behind the planner: re-reads the field's text on the
 * page and refuses consent / legal / opt-in fields whatever the instruction.
 */
function isConsentElement(el: HTMLElement): boolean {
  const type = (el as HTMLInputElement).type;
  const choice = el.tagName === 'SELECT' || type === 'checkbox' || type === 'radio' || el.getAttribute('role') === 'combobox';
  const text = [
    resolveLabel(el),
    el.getAttribute('aria-label') ?? '',
    el.closest('fieldset')?.querySelector('legend')?.textContent ?? '',
    (el as HTMLInputElement).name ?? '',
  ].join(' ');
  if (!isConsentText(text)) return false;
  return choice || /\b(signature|sign|firma|firmar)\b/i.test(text);
}

async function applyOne(doc: Document, ins: FillInstruction, opts: ApplyOptions): Promise<FillResult> {
  const el = doc.querySelector<HTMLElement>(`[${UID_ATTR}="${ins.uid}"]`);
  if (!el) return { uid: ins.uid, status: 'not-found' };
  if (isConsentElement(el)) return { uid: ins.uid, status: 'skipped-consent' };
  try {
    const v = ins.value;
    const tag = el.tagName;
    const type = (el as HTMLInputElement).type;
    const isCombobox = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list';
    let status: FillResult['status'];

    if (v.type === 'file') {
      status = tag === 'INPUT' && type === 'file' ? fillFile(el as HTMLInputElement, v, opts) : 'failed';
    } else if (tag === 'SELECT') {
      const candidates = v.type === 'choice' ? v.candidates : v.type === 'bool' ? [v.value ? 'Yes' : 'No'] : [v.text];
      status = fillSelect(el as HTMLSelectElement, candidates, opts);
    } else if (tag === 'INPUT' && (type === 'radio' || type === 'checkbox')) {
      const inputs = groupInputs(doc, ins.uid);
      if (inputs.length > 1 || type === 'radio') {
        const candidates = v.type === 'choice' ? v.candidates : v.type === 'bool' ? [v.value ? 'Yes' : 'No'] : [v.text];
        status = fillChoiceGroup(inputs, candidates, opts);
      } else {
        const value = v.type === 'bool' ? v.value : v.type === 'choice' ? true : Boolean(v.text);
        status = fillCheckbox(el as HTMLInputElement, value, opts);
      }
    } else if (isCombobox) {
      const candidates = v.type === 'choice' ? v.candidates : v.type === 'bool' ? [v.value ? 'Yes' : 'No'] : [v.text];
      status = await fillCombobox(el, candidates, opts);
    } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const text = v.type === 'text' ? v.text : v.type === 'bool' ? (v.value ? 'Yes' : 'No') : (v.candidates[0] ?? '');
      status = fillText(el as HTMLInputElement, text, opts);
    } else {
      status = 'failed';
    }
    if (status === 'filled' && type !== 'radio') highlight(el);
    return { uid: ins.uid, status };
  } catch (error) {
    return { uid: ins.uid, status: 'failed', detail: (error as Error).message };
  }
}

/** Applies fill instructions sequentially. Never submits the form. */
export async function applyInstructions(doc: Document, instructions: FillInstruction[], opts: ApplyOptions): Promise<FillResult[]> {
  const results: FillResult[] = [];
  for (const ins of instructions) results.push(await applyOne(doc, ins, opts));
  return results;
}
