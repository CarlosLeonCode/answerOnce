import type { Page } from '@playwright/test';

/**
 * Current values of every form control on the page, keyed by id (or name).
 * Checkboxes report "checked"/"unchecked"; radio groups report the checked
 * value under the group name; file inputs report the attached file names.
 */
export async function formValues(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const values: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
      if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'hidden')) continue;
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (!(el.name in values)) values[el.name] = '';
        if (el.checked) values[el.name] = el.value;
        continue;
      }
      const key = el.id || el.name;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') values[key] = el.checked ? 'checked' : 'unchecked';
      else if (el instanceof HTMLInputElement && el.type === 'file') values[key] = [...(el.files ?? [])].map((f) => f.name).join(',');
      else values[key] = el.value;
    }
    return values;
  });
}
