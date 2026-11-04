import { describe, expect, it, vi } from 'vitest';
import type { FillInstruction } from '../../src/domain/fill';
import { collectFields } from '../../src/page-agent/detector';
import { applyInstructions, setNativeValue } from '../../src/page-agent/filler';
import { htmlDocument } from '../helpers/dom';

/**
 * Mimics React's controlled-input value tracking: React defines an instance
 * `value` property whose setter records the "last known" value. Assigning
 * `el.value = x` goes through it, so React thinks nothing changed and ignores
 * the input event. The native prototype setter bypasses it.
 */
function makeReactLike(input: HTMLInputElement) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElementProto(input), 'value')!;
  let tracked = input.value;
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() {
      return descriptor.get!.call(this);
    },
    set(v: string) {
      tracked = v;
      descriptor.set!.call(this, v);
    },
  });
  const onChange = vi.fn();
  input.addEventListener('input', () => {
    // React only fires onChange when the DOM value differs from the tracked value.
    if (descriptor.get!.call(input) !== tracked) {
      tracked = descriptor.get!.call(input);
      onChange(tracked);
    }
  });
  return onChange;
}

function HTMLInputElementProto(el: Element) {
  return el.ownerDocument.defaultView!.HTMLInputElement.prototype;
}

function setup(body: string) {
  const doc = htmlDocument(body);
  const fields = collectFields(doc);
  const uid = (name: string) => fields.find((f) => f.name === name)!.uid;
  return { doc, fields, uid };
}

describe('setNativeValue', () => {
  it('triggers a React-like onChange where plain assignment would not', () => {
    const doc = htmlDocument('<input id="x">');
    const input = doc.getElementById('x') as HTMLInputElement;
    const onChange = makeReactLike(input);

    input.value = 'plain';
    input.dispatchEvent(new (doc.defaultView!.Event)('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();

    setNativeValue(input, 'native');
    expect(onChange).toHaveBeenCalledWith('native');
  });

  it('dispatches bubbling input and change events', () => {
    const doc = htmlDocument('<form><textarea id="t"></textarea></form>');
    const seen: string[] = [];
    doc.querySelector('form')!.addEventListener('input', () => seen.push('input'));
    doc.querySelector('form')!.addEventListener('change', () => seen.push('change'));
    setNativeValue(doc.getElementById('t') as HTMLTextAreaElement, 'hello');
    expect(seen).toEqual(['input', 'change']);
    expect((doc.getElementById('t') as HTMLTextAreaElement).value).toBe('hello');
  });
});

describe('applyInstructions', () => {
  it('fills text, select, radio and checkbox fields and highlights them', async () => {
    const { doc, uid } = setup(`
      <label>First name <input name="first"></label>
      <label>Country <select name="country"><option value="">Select…</option><option value="es">Spain</option><option value="fr">France</option></select></label>
      <fieldset><legend>Need sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="1">Yes</label>
        <label><input type="radio" name="sponsor" value="0">No</label>
      </fieldset>
      <label><input type="checkbox" name="relocate"> Willing to relocate</label>
    `);
    const instructions: FillInstruction[] = [
      { uid: uid('first'), value: { type: 'text', text: 'Ada' } },
      { uid: uid('country'), value: { type: 'choice', candidates: ['Spain'] } },
      { uid: uid('sponsor'), value: { type: 'choice', candidates: ['no', 'false'] } },
      { uid: uid('relocate'), value: { type: 'bool', value: true } },
    ];
    const results = await applyInstructions(doc, instructions, { overwrite: false });
    expect(results.map((r) => r.status)).toEqual(['filled', 'filled', 'filled', 'filled']);
    expect((doc.querySelector('[name=first]') as HTMLInputElement).value).toBe('Ada');
    expect((doc.querySelector('[name=country]') as HTMLSelectElement).value).toBe('es');
    expect((doc.querySelector('[name=sponsor][value="0"]') as HTMLInputElement).checked).toBe(true);
    expect((doc.querySelector('[name=relocate]') as HTMLInputElement).checked).toBe(true);
    expect(doc.querySelector('[name=first]')!.getAttribute('data-answeronce-filled')).toBe('true');
  });

  it('never overwrites a non-empty field unless asked to', async () => {
    const { doc, uid } = setup('<label>Email <input name="email" value="keep@me.com"></label>');
    const ins: FillInstruction[] = [{ uid: uid('email'), value: { type: 'text', text: 'new@me.com' } }];
    const [kept] = await applyInstructions(doc, ins, { overwrite: false });
    expect(kept!.status).toBe('skipped-nonempty');
    expect((doc.querySelector('[name=email]') as HTMLInputElement).value).toBe('keep@me.com');
    const [over] = await applyInstructions(doc, ins, { overwrite: true });
    expect(over!.status).toBe('filled');
    expect((doc.querySelector('[name=email]') as HTMLInputElement).value).toBe('new@me.com');
  });

  it('reports unknown options and missing elements', async () => {
    const { doc, uid } = setup('<label>Size <select name="s"><option value="">--</option><option>Small</option></select></label>');
    const results = await applyInstructions(
      doc,
      [
        { uid: uid('s'), value: { type: 'choice', candidates: ['Huge'] } },
        { uid: 'missing', value: { type: 'text', text: 'x' } },
      ],
      { overwrite: false },
    );
    expect(results.map((r) => r.status)).toEqual(['failed', 'not-found']);
  });

  it('never submits the form', async () => {
    const { doc, uid } = setup('<form><label>Name <input name="n"></label><button type="submit">Send</button></form>');
    const submit = vi.fn((e: Event) => e.preventDefault());
    doc.querySelector('form')!.addEventListener('submit', submit);
    await applyInstructions(doc, [{ uid: uid('n'), value: { type: 'text', text: 'Ada' } }], { overwrite: false });
    expect(submit).not.toHaveBeenCalled();
  });
});
