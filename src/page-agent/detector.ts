import type { FieldDescriptor, FieldKind } from '../domain/field';
import { cleanMeta, JOB_META_SELECTORS, type PageMeta } from '../domain/job-meta';
import { cleanText, groupLabel, resolveLabel, textWithoutControls } from './label';

export const UID_ATTR = 'data-answeronce-uid';

const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color']);
const PLACEHOLDER_OPTION = /^(select|choose|please select|pick|seleccion|elige|escoge|--|—|-)/i;
const MAX_JOB_TEXT = 8000;

export interface DocumentScan {
  url: string;
  title: string;
  hints: string[];
  fields: FieldDescriptor[];
  jobText: string;
  meta: PageMeta;
}

let uidCounter = 0;

function uidFor(el: Element): string {
  const existing = el.getAttribute(UID_ATTR);
  if (existing) return existing;
  const uid = `h${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
  el.setAttribute(UID_ATTR, uid);
  return uid;
}

function isHidden(el: Element): boolean {
  const win = el.ownerDocument.defaultView;
  let node: Element | null = el;
  for (let depth = 0; node && depth < 12; depth++) {
    if ((node as HTMLElement).hidden) return true;
    const style = win?.getComputedStyle(node);
    if (style && (style.display === 'none' || (depth === 0 && style.visibility === 'hidden'))) return true;
    node = node.parentElement;
  }
  return false;
}

function inputKind(input: HTMLInputElement): FieldKind | null {
  const type = (input.getAttribute('type') ?? 'text').toLowerCase();
  if (SKIPPED_INPUT_TYPES.has(type)) return null;
  if (input.getAttribute('role') === 'combobox' || input.getAttribute('aria-autocomplete') === 'list') return 'combobox';
  switch (type) {
    case 'email': return 'email';
    case 'tel': return 'tel';
    case 'url': return 'url';
    case 'number': return 'number';
    case 'date':
    case 'month': return 'date';
    case 'radio': return 'radio';
    case 'checkbox': return 'checkbox';
    case 'file': return 'file';
    default: return 'text';
  }
}

export function isPlaceholderOption(option: HTMLOptionElement): boolean {
  return option.value === '' || PLACEHOLDER_OPTION.test(cleanText(option.text));
}

function selectValue(select: HTMLSelectElement): string {
  const opt = select.selectedOptions[0];
  if (!opt || isPlaceholderOption(opt)) return '';
  return cleanText(opt.text);
}

function base(el: Element, kind: FieldKind): FieldDescriptor {
  return {
    uid: uidFor(el),
    kind,
    label: resolveLabel(el),
    name: el.getAttribute('name') ?? '',
    htmlId: el.getAttribute('id') ?? '',
    placeholder: cleanText(el.getAttribute('placeholder')),
    ariaLabel: cleanText(el.getAttribute('aria-label')),
    autocomplete: el.getAttribute('autocomplete') ?? '',
    options: [],
    required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    currentValue: '',
    accept: el.getAttribute('accept') ?? '',
  };
}

function optionLabel(input: HTMLInputElement): string {
  return resolveLabel(input) || input.value;
}

/** Collects all fillable controls of a document (one frame). */
export function collectFields(doc: Document): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const groups = new Map<string, HTMLInputElement[]>();
  const controls = Array.from(doc.querySelectorAll<HTMLElement>('input, select, textarea, [role="combobox"]:not(input)'));

  for (const el of controls) {
    if (el.closest('[data-answeronce-ignore]')) continue;
    if (el.tagName === 'INPUT') {
      const input = el as HTMLInputElement;
      const kind = inputKind(input);
      if (!kind) continue;
      if (kind !== 'file' && isHidden(input)) continue;
      if (input.disabled || input.readOnly) continue;
      if (kind === 'radio' || kind === 'checkbox') {
        const key = `${kind}:${input.form?.id ?? ''}:${input.name || uidFor(input)}`;
        const list = groups.get(key) ?? [];
        list.push(input);
        groups.set(key, list);
        continue;
      }
      const field = base(input, kind);
      field.currentValue = kind === 'file' ? (input.files?.length ? 'file' : '') : input.value;
      fields.push(field);
    } else if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      if (select.disabled || isHidden(select)) continue;
      const field = base(select, 'select');
      field.options = Array.from(select.options).filter((o) => !isPlaceholderOption(o)).map((o) => cleanText(o.text));
      field.currentValue = selectValue(select);
      fields.push(field);
    } else if (el.tagName === 'TEXTAREA') {
      const ta = el as HTMLTextAreaElement;
      if (ta.disabled || ta.readOnly || isHidden(ta)) continue;
      const field = base(ta, 'textarea');
      field.currentValue = ta.value;
      fields.push(field);
    } else if (!isHidden(el)) {
      // Non-input combobox (e.g. div[role=combobox]); best effort.
      const field = base(el, 'combobox');
      field.currentValue = cleanText(el.textContent);
      fields.push(field);
    }
  }

  for (const inputs of groups.values()) {
    const first = inputs[0]!;
    const kind = first.type === 'radio' ? 'radio' : 'checkbox';
    if (kind === 'checkbox' && inputs.length === 1) {
      const field = base(first, 'checkbox');
      field.currentValue = String(first.checked);
      fields.push(field);
      continue;
    }
    const field = base(first, kind);
    for (const input of inputs) input.setAttribute(UID_ATTR, field.uid);
    field.label = groupLabel(first, doc) || field.label;
    field.options = inputs.map(optionLabel);
    field.currentValue = inputs.filter((i) => i.checked).map(optionLabel).join(', ');
    field.required = inputs.some((i) => i.required);
    fields.push(field);
  }
  return fields;
}

export function detectHints(doc: Document): string[] {
  const hints: string[] = [];
  const has = (selector: string) => doc.querySelector(selector) !== null;
  if (has('[name^="job_application["], #grnhse_app, #application_form[action*="greenhouse"], .application--container, [data-provides="greenhouse"]') || /greenhouse/i.test(doc.querySelector('meta[name="generator"]')?.getAttribute('content') ?? '')) {
    hints.push('greenhouse');
  }
  if (has('[name="urls[LinkedIn]"], .posting-page, form[action*="lever.co"]')) hints.push('lever');
  if (has('[name^="_systemfield_"], [id^="_systemfield_"], .ashby-application-form-container')) hints.push('ashby');
  return hints;
}

const JOB_SELECTORS = [
  '[data-qa="job-description"]',
  '.job-description',
  '#job-description',
  '.ashby-job-posting-description',
  '.posting-page .section-wrapper',
  '#content .job__description',
  '.job__description',
  '#content',
  '[class*="description" i]',
  'article',
  'main',
];

export function extractJobText(doc: Document): string {
  for (const selector of JOB_SELECTORS) {
    let el: Element | null = null;
    try {
      el = doc.querySelector(selector);
    } catch {
      continue;
    }
    const text = el ? textWithoutControls(el, MAX_JOB_TEXT) : '';
    if (text.length > 300) return text.slice(0, MAX_JOB_TEXT);
  }
  return cleanText(doc.body?.innerText ?? doc.body?.textContent ?? '', MAX_JOB_TEXT);
}

function metaContent(doc: Document, property: string): string {
  return cleanMeta(doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.getAttribute('content'));
}

/** Text used to tell the company and role of the job (interpreted by the ATS adapters). */
export function extractPageMeta(doc: Document): PageMeta {
  const marks: Record<string, string> = {};
  for (const selector of JOB_META_SELECTORS) {
    const text = cleanMeta(doc.querySelector(selector)?.textContent);
    if (text) marks[selector] = text;
  }
  const h1 = Array.from(doc.querySelectorAll('h1')).find((el) => !isHidden(el) && cleanMeta(el.textContent));
  return {
    title: cleanMeta(doc.title),
    ogTitle: metaContent(doc, 'og:title'),
    ogSiteName: metaContent(doc, 'og:site_name'),
    h1: cleanMeta(h1?.textContent),
    marks,
  };
}

export function scanDocument(doc: Document): DocumentScan {
  return {
    url: doc.location?.href ?? '',
    title: doc.title,
    hints: detectHints(doc),
    fields: collectFields(doc),
    jobText: extractJobText(doc),
    meta: extractPageMeta(doc),
  };
}
