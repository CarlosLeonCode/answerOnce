/**
 * Label resolution for form controls. Runs inside the page (bundled into the
 * injected page agent) and in tests under jsdom.
 */

const MAX_LABEL = 300;
const CONTROL_SELECTOR = 'input, select, textarea, button, [role="combobox"], [role="listbox"]';

export function cleanText(text: string | null | undefined, max = MAX_LABEL): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[*✱]\s*$/u, '')
    .trim()
    .slice(0, max);
}

/** Text content of `el` excluding nested form controls (e.g. <option>s of a wrapped <select>). */
export function textWithoutControls(el: Element, max = MAX_LABEL): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(`${CONTROL_SELECTOR}, script, style, [aria-hidden="true"]`).forEach((n) => n.remove());
  return cleanText(clone.textContent, max);
}

function byIds(doc: Document, ids: string | null): string {
  if (!ids) return '';
  return cleanText(
    ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => textWithoutControls(n))
      .join(' '),
  );
}

function labelFor(el: Element, doc: Document): string {
  const id = el.getAttribute('id');
  if (!id) return '';
  for (const label of Array.from(doc.querySelectorAll('label'))) {
    if (label.htmlFor === id) {
      const text = textWithoutControls(label);
      if (text) return text;
    }
  }
  return '';
}

function wrappingLabel(el: Element): string {
  const label = el.closest('label');
  return label ? textWithoutControls(label) : '';
}

/** Looks at preceding siblings and ancestors for a short, text-only element. */
export function nearbyText(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++) {
    let sib = node.previousElementSibling;
    for (let hops = 0; sib && hops < 3; hops++) {
      // Text before another control belongs to that control: stop at this level.
      if (sib.matches(CONTROL_SELECTOR) || sib.querySelector('input, select, textarea')) break;
      const forOther = sib.tagName === 'LABEL' && (sib as HTMLLabelElement).htmlFor && (sib as HTMLLabelElement).htmlFor !== el.id;
      if (!forOther) {
        const text = textWithoutControls(sib);
        if (text && text.length <= 200) return text;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
    if (node?.matches('form, body')) break;
  }
  return '';
}

/** Group label for radio/checkbox groups: fieldset legend, radiogroup label, or nearby text. */
export function groupLabel(first: Element, doc: Document): string {
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const t = byIds(doc, group.getAttribute('aria-labelledby')) || cleanText(group.getAttribute('aria-label'));
    if (t) return t;
  }
  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend) {
    const t = textWithoutControls(legend);
    if (t) return t;
  }
  // Skip past the option labels themselves: start from the container of the group.
  const container = (fieldset ?? first.closest('label')?.parentElement ?? first.parentElement)?.parentElement ?? null;
  const optionContainer = first.closest('label')?.parentElement ?? first.parentElement;
  return (optionContainer && nearbyText(optionContainer)) || (container && nearbyText(container)) || '';
}

/**
 * Resolves the human-readable label of a form control, trying (in order):
 * aria-labelledby, <label for>, wrapping <label>, aria-label, nearby text, placeholder.
 */
export function resolveLabel(el: Element, doc: Document = el.ownerDocument): string {
  return (
    byIds(doc, el.getAttribute('aria-labelledby')) ||
    labelFor(el, doc) ||
    wrappingLabel(el) ||
    cleanText(el.getAttribute('aria-label')) ||
    nearbyText(el) ||
    cleanText(el.getAttribute('placeholder')) ||
    cleanText(el.getAttribute('title'))
  );
}
