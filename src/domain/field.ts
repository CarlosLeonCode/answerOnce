import type { PageMeta } from './job-meta';

/**
 * A form field as detected on the page. Plain, serializable data: it crosses
 * the extension <-> page boundary via chrome.scripting.executeScript.
 */

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'combobox';

export interface FieldDescriptor {
  /** Stable id assigned by the page agent (stored in a data attribute). */
  uid: string;
  kind: FieldKind;
  /** Best-effort human label resolved from the DOM. */
  label: string;
  name: string;
  htmlId: string;
  placeholder: string;
  ariaLabel: string;
  autocomplete: string;
  /** Visible option texts for select / radio groups / comboboxes (when known). */
  options: string[];
  required: boolean;
  /** Current value (text) or checked state ("true"/"false") of the field. */
  currentValue: string;
  /** `accept` attribute for file inputs. */
  accept: string;
}

export interface FrameScan {
  frameId: number;
  url: string;
  /** DOM hints used by ATS adapters (e.g. "greenhouse", "lever", "ashby"). */
  hints: string[];
  fields: FieldDescriptor[];
  /** Heuristic job description text (truncated). */
  jobText: string;
  title: string;
  /** Job header text (title, og tags, h1, ATS headings) for company/role detection. */
  meta: PageMeta;
}

export function isEmptyValue(field: FieldDescriptor): boolean {
  if (field.kind === 'checkbox') return field.currentValue !== 'true';
  return field.currentValue.trim() === '';
}

/** Fields that usually hold free-form answers (candidates for AI). */
export function isOpenEnded(field: FieldDescriptor): boolean {
  return field.kind === 'textarea' || (field.kind === 'text' && field.label.length > 40);
}
